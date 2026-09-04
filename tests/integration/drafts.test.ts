import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  publishDraft,
  reviewDraft,
  submitDraft,
  WorkflowError,
} from '../../functions/src/publish/drafts';
import type { Deps } from '../../functions/src/shared/deps';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';

/**
 * The editorial state machine.
 *
 * Security rules cannot see who wrote a draft, so the rule that gives review
 * its meaning — an editor may not approve their own work — lives here and is
 * tested here.
 */

let app: App;
let db: Firestore;
let deps: Deps;
let objects: Map<string, string>;

const EDITOR = 'editor-1';
const REVIEWER = 'reviewer-1';

async function makeDraft(state = 'draft', authorUid = EDITOR, seed = skyDarknessSeed) {
  await db.collection('cmsDrafts').doc('draft-1').set({
    draftId: 'draft-1',
    state,
    authorUid,
    seed,
    updatedAt: '2026-09-03T10:00:00.000Z',
  });
}

const stateOf = async () =>
  (await db.collection('cmsDrafts').doc('draft-1').get()).data()?.state as string;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'drafts-test');
  db = getFirestore(app);
});

afterAll(async () => {
  // The admin Firestore keeps a gRPC channel that `deleteApp` does not
  // close, which leaves the process alive after the run finishes.
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  objects = new Map();
  deps = {
    db,
    async putObject(path, body) {
      objects.set(path, body);
      return path;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => new Date('2026-09-03T12:00:00.000Z'),
  };

  for (const name of ['cmsDrafts', 'cmsReviews', 'seeds', 'seedRevisions']) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

describe('submitting', () => {
  it('moves a draft into review and records who did it', async () => {
    await makeDraft();
    expect(await submitDraft(deps, { draftId: 'draft-1', actorUid: EDITOR })).toEqual({
      state: 'in_review',
    });
    expect(await stateOf()).toBe('in_review');

    const audit = await db.collection('cmsReviews').get();
    expect(audit.docs[0].data()).toMatchObject({ actorUid: EDITOR, to: 'in_review' });
  });

  // A reviewer's attention belongs on whether the content is right, not on
  // whether it is structurally complete.
  it('refuses content that would fail the publish gate', async () => {
    await makeDraft('draft', EDITOR, { ...skyDarknessSeed, sources: [] });

    await expect(submitDraft(deps, { draftId: 'draft-1', actorUid: EDITOR })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(await stateOf()).toBe('draft');
  });

  it('accepts a resubmission after changes were requested', async () => {
    await makeDraft('changes_requested');
    expect(await submitDraft(deps, { draftId: 'draft-1', actorUid: EDITOR })).toEqual({
      state: 'in_review',
    });
  });

  it('refuses to submit something already in review', async () => {
    await makeDraft('in_review');
    await expect(submitDraft(deps, { draftId: 'draft-1', actorUid: EDITOR })).rejects.toMatchObject({
      code: 'wrong-state',
    });
  });
});

describe('reviewing', () => {
  it('approves a draft written by someone else', async () => {
    await makeDraft('in_review');
    expect(
      await reviewDraft(deps, { draftId: 'draft-1', actorUid: REVIEWER, decision: 'approve' })
    ).toEqual({ state: 'approved' });
  });

  // The rule that makes review mean anything.
  it('refuses self-approval', async () => {
    await makeDraft('in_review', EDITOR);

    await expect(
      reviewDraft(deps, { draftId: 'draft-1', actorUid: EDITOR, decision: 'approve' })
    ).rejects.toBeInstanceOf(WorkflowError);
    expect(await stateOf()).toBe('in_review');
  });

  it('lets an author request changes on their own draft', async () => {
    // Not an approval, so no conflict of interest.
    await makeDraft('in_review', EDITOR);
    expect(
      await reviewDraft(deps, {
        draftId: 'draft-1',
        actorUid: EDITOR,
        decision: 'request_changes',
        note: 'منبع ناکافی',
      })
    ).toEqual({ state: 'changes_requested' });
  });

  it('records the note with the decision', async () => {
    await makeDraft('in_review');
    await reviewDraft(deps, {
      draftId: 'draft-1',
      actorUid: REVIEWER,
      decision: 'request_changes',
      note: 'تاریخ منبع غلط است',
    });

    const audit = await db.collection('cmsReviews').get();
    expect(audit.docs[0].data()).toMatchObject({ note: 'تاریخ منبع غلط است' });
  });
});

describe('publishing', () => {
  it('publishes an approved draft and links the revision back to it', async () => {
    await makeDraft('approved');
    const result = await publishDraft(deps, { draftId: 'draft-1', actorUid: EDITOR });

    expect(result.revision).toBe(skyDarknessSeed.revision);
    expect(objects.size).toBe(1);

    const draft = await db.collection('cmsDrafts').doc('draft-1').get();
    expect(draft.data()).toMatchObject({ state: 'published', publishedRevision: result.revision });

    const seed = await db.collection('seeds').doc(skyDarknessSeed.id).get();
    expect(seed.data()?.status).toBe('published');
  });

  it('refuses anything that has not been approved', async () => {
    for (const state of ['draft', 'in_review', 'changes_requested']) {
      await makeDraft(state);
      await expect(
        publishDraft(deps, { draftId: 'draft-1', actorUid: EDITOR })
      ).rejects.toMatchObject({ code: 'not-approved' });
    }
  });

  it('leaves nothing published when the draft does not exist', async () => {
    await expect(
      publishDraft(deps, { draftId: 'missing', actorUid: EDITOR })
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(objects.size).toBe(0);
  });
});
