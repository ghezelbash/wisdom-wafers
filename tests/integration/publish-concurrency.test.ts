import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { publishDraft, reviewDraft, submitDraft, WorkflowError } from '../../functions/src/publish/drafts';
import {
  bundleStoragePath,
  publishSeed,
  rollbackSeed,
  PublishError,
} from '../../functions/src/publish/publish-seed';
import type { Deps } from '../../functions/src/shared/deps';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';

/**
 * What happens when two people press the button at the same moment.
 *
 * A published revision is immutable, and "immutable" has to survive
 * concurrency: checking whether a revision exists and then uploading is two
 * operations with a gap, and both callers used to pass the check before either
 * wrote. The result was one artifact holding the loser's bytes under the
 * winner's checksum — which every device would then refuse as corrupt.
 */

const ACTOR = 'editor-1';
const REVIEWER = 'reviewer-1';
const NOW = new Date('2026-09-05T12:00:00.000Z');

let app: App;
let db: Firestore;
let objects: Map<string, string>;
let putCalls: string[];
let deps: Deps;

/** A bucket that refuses to overwrite, the way Storage does with `ifAbsent`. */
function makeDeps(): Deps {
  return {
    db,
    async putObject(path, body, _contentType, options) {
      putCalls.push(path);
      if (options?.ifAbsent && objects.has(path)) {
        throw new Error('412 Precondition Failed: object already exists');
      }
      objects.set(path, body);
      return `demo-bucket/${path}`;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => NOW,
  };
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'publish-concurrency');
  db = getFirestore(app);
});

afterAll(async () => {
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  objects = new Map();
  putCalls = [];
  deps = makeDeps();

  for (const name of ['seeds', 'seedRevisions', 'cmsDrafts', 'cmsReviews']) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

const settled = async <T,>(work: Promise<T>[]) => Promise.allSettled(work);
const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((result) => result.status === 'fulfilled');
const rejected = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];

describe('two publishes of the same revision', () => {
  it('produce exactly one winner', async () => {
    const results = await settled([
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR }),
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-2' }),
    ]);

    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results)).toHaveLength(1);
    expect(rejected(results)[0].reason).toBeInstanceOf(PublishError);
  });

  it('leave one artifact, matching the checksum the catalogue published', async () => {
    await settled([
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR }),
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-2' }),
    ]);

    const path = bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision);
    expect(objects.size).toBe(1);

    const stored = JSON.parse(objects.get(path)!);
    const seedDoc = await db.doc(`seeds/${skyDarknessSeed.id}`).get();
    expect(seedDoc.data()?.checksum).toBe(stored.checksum);
  });

  /**
   * Different bytes under the same revision number is the case with no correct
   * answer, so it is refused rather than resolved.
   */
  it('refuse a second publish of the same revision with different content', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });

    await expect(
      publishSeed(deps, {
        seed: { ...skyDarknessSeed, title: 'عنوان دیگری' },
        actorUid: 'editor-2',
      })
    ).rejects.toMatchObject({ code: 'revision-exists' });
  });

  it('never overwrite an existing object', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const before = objects.get(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision));

    await settled([
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-2' }),
      publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-3' }),
    ]);

    expect(objects.get(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision))).toBe(
      before
    );
  });
});

describe('a publish that dies after reserving', () => {
  it('leaves a reservation that a retry can finish', async () => {
    const failingUpload: Deps = {
      ...deps,
      async putObject() {
        throw new Error('network gone');
      },
    };

    await expect(
      publishSeed(failingUpload, { seed: skyDarknessSeed, actorUid: ACTOR })
    ).rejects.toBeDefined();

    // Reserved, not published: no reader follows a pointer to it.
    const revision = await db
      .doc(`seedRevisions/${skyDarknessSeed.id}_${skyDarknessSeed.revision}`)
      .get();
    expect(revision.data()?.status).toBe('reserved');
    expect((await db.doc(`seeds/${skyDarknessSeed.id}`).get()).exists).toBe(false);

    // The same content finishes it.
    const result = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    expect(result.revision).toBe(skyDarknessSeed.revision);
    expect((await db.doc(`seeds/${skyDarknessSeed.id}`).get()).data()?.status).toBe('published');
  });

  it('does not let different content take over a reservation', async () => {
    const failingUpload: Deps = {
      ...deps,
      async putObject() {
        throw new Error('network gone');
      },
    };
    await expect(
      publishSeed(failingUpload, { seed: skyDarknessSeed, actorUid: ACTOR })
    ).rejects.toBeDefined();

    await expect(
      publishSeed(deps, { seed: { ...skyDarknessSeed, title: 'دیگری' }, actorUid: 'editor-2' })
    ).rejects.toMatchObject({ code: 'revision-exists' });
  });
});

describe('rollback restores the whole summary', () => {
  it('moves the title, topic and duration back, not only the pointer', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });

    const corrected = {
      ...skyDarknessSeed,
      revision: skyDarknessSeed.revision + 1,
      title: 'عنوان اصلاح‌شده',
      estimatedMinutes: 12,
      topicId: 'psychology',
    };
    await publishSeed(deps, { seed: corrected, actorUid: ACTOR });

    const after = await db.doc(`seeds/${skyDarknessSeed.id}`).get();
    expect(after.data()).toMatchObject({ title: 'عنوان اصلاح‌شده', estimatedMinutes: 12 });

    await rollbackSeed(deps, {
      seedId: skyDarknessSeed.id,
      toRevision: skyDarknessSeed.revision,
      actorUid: 'admin-1',
    });

    // The failure this prevents: the pointer goes back and the *newer*
    // revision's title stays on the card.
    const rolled = await db.doc(`seeds/${skyDarknessSeed.id}`).get();
    expect(rolled.data()).toMatchObject({
      currentRevision: skyDarknessSeed.revision,
      title: skyDarknessSeed.title,
      estimatedMinutes: skyDarknessSeed.estimatedMinutes,
      topicId: skyDarknessSeed.topicId,
    });
  });

  it('keeps both artifacts, because rollback is a pointer move', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const next = { ...skyDarknessSeed, revision: skyDarknessSeed.revision + 1 };
    await publishSeed(deps, { seed: next, actorUid: ACTOR });

    await rollbackSeed(deps, {
      seedId: skyDarknessSeed.id,
      toRevision: skyDarknessSeed.revision,
      actorUid: 'admin-1',
    });

    expect(objects.has(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision))).toBe(true);
    expect(objects.has(bundleStoragePath(next.id, next.revision))).toBe(true);
  });
});

describe('two people acting on one draft at once', () => {
  const draftId = 'race-draft';

  const seedDraft = async (state: string, seed = skyDarknessSeed) =>
    db.doc(`cmsDrafts/${draftId}`).set({
      draftId,
      state,
      authorUid: ACTOR,
      seed,
      updatedAt: NOW.toISOString(),
    });

  it('lets exactly one review land, with one audit entry', async () => {
    await seedDraft('in_review');

    const results = await settled([
      reviewDraft(deps, { draftId, actorUid: REVIEWER, decision: 'approve' }),
      reviewDraft(deps, { draftId, actorUid: 'reviewer-2', decision: 'request_changes' }),
    ]);

    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results)[0].reason).toBeInstanceOf(WorkflowError);

    // One transition, one entry: the audit trail cannot claim a state changed
    // twice when it changed once.
    const audit = await db.collection('cmsReviews').where('draftId', '==', draftId).get();
    expect(audit.size).toBe(1);
  });

  it('lets exactly one publish claim an approved draft', async () => {
    const unique = { ...skyDarknessSeed, id: 'race-seed', revision: 1 };
    await seedDraft('approved', unique);

    const results = await settled([
      publishDraft(deps, { draftId, actorUid: ACTOR }),
      publishDraft(deps, { draftId, actorUid: 'editor-2' }),
    ]);

    expect(fulfilled(results)).toHaveLength(1);
    expect((await db.doc(`cmsDrafts/${draftId}`).get()).data()?.state).toBe('published');
    expect(objects.size).toBe(1);
  });

  it('returns a draft to approved when the pipeline refuses it', async () => {
    // Already published at this revision, so the pipeline will refuse.
    const unique = { ...skyDarknessSeed, id: 'blocked-seed', revision: 1 };
    await publishSeed(deps, { seed: unique, actorUid: ACTOR });
    await seedDraft('approved', unique);

    await expect(publishDraft(deps, { draftId, actorUid: ACTOR })).rejects.toBeDefined();

    // Not stranded in `publishing`: the editor can act on the objection.
    expect((await db.doc(`cmsDrafts/${draftId}`).get()).data()?.state).toBe('approved');
  });

  it('records one entry per transition through the whole workflow', async () => {
    const unique = { ...skyDarknessSeed, id: 'flow-seed', revision: 1 };
    await seedDraft('draft', unique);

    await submitDraft(deps, { draftId, actorUid: ACTOR });
    await reviewDraft(deps, { draftId, actorUid: REVIEWER, decision: 'approve' });
    await publishDraft(deps, { draftId, actorUid: ACTOR });

    const audit = await db.collection('cmsReviews').where('draftId', '==', draftId).get();
    const transitions = audit.docs.map((document) => `${document.data().from}→${document.data().to}`);

    expect(transitions).toEqual(
      expect.arrayContaining([
        'draft→in_review',
        'in_review→approved',
        'approved→publishing',
        'publishing→published',
      ])
    );
  });
});
