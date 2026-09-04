import { unknownBlockSeed } from '../../src/data/__fixtures__/unknown-block-seed';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';
import { parseBundleLenient, verifyChecksum, type Seed } from '@dananeh/content-schema';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  bundleStoragePath,
  publishSeed,
  rollbackSeed,
  PublishError,
} from '../../functions/src/publish/publish-seed';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * The publish pipeline against the Firestore emulator.
 *
 * Storage is stubbed with an in-memory object store: what matters here is the
 * order and atomicity of the writes — validate, compile, upload, then flip the
 * pointer — not the bytes reaching a bucket.
 */

let app: App;
let db: Firestore;
let objects: Map<string, string>;
let deps: Deps;

const ACTOR = 'editor-1';

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'publish-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  objects = new Map();
  deps = {
    db,
    async putObject(path, body) {
      objects.set(path, body);
      return `demo-bucket/${path}`;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => new Date('2026-09-03T12:00:00.000Z'),
  };

  for (const collection of ['seeds', 'seedRevisions']) {
    const snapshot = await db.collection(collection).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

describe('publishing a seed', () => {
  it('writes an immutable artifact and points the catalogue at it', async () => {
    const result = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });

    expect(result.seedId).toBe(skyDarknessSeed.id);
    expect(result.revision).toBe(skyDarknessSeed.revision);
    expect(result.storagePath).toBe(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision));

    const stored = objects.get(result.storagePath);
    expect(stored).toBeDefined();

    const parsed = parseBundleLenient(JSON.parse(stored!));
    expect(parsed.ok).toBe(true);

    const seedDoc = await db.collection('seeds').doc(skyDarknessSeed.id).get();
    expect(seedDoc.data()).toMatchObject({
      status: 'published',
      currentRevision: skyDarknessSeed.revision,
      // The whole manifest, so a device can fetch and verify with one read.
      seedId: skyDarknessSeed.id,
      revision: skyDarknessSeed.revision,
      storagePath: result.storagePath,
      checksum: result.checksum,
      bytes: result.bytes,
      schemaVersion: skyDarknessSeed.schemaVersion,
      publishedAt: '2026-09-03T12:00:00.000Z',
    });

    // The size on the catalogue document is the size of the object itself.
    expect(result.bytes).toBe(Buffer.byteLength(stored!, 'utf8'));

    // The catalogue document is a list entry, not the content.
    expect(seedDoc.data()?.blocks).toBeUndefined();

    const revisionDoc = await db
      .collection('seedRevisions')
      .doc(`${skyDarknessSeed.id}_${skyDarknessSeed.revision}`)
      .get();
    expect(revisionDoc.data()).toMatchObject({
      status: 'published',
      publishedBy: ACTOR,
      storagePath: result.storagePath,
      bytes: result.bytes,
      schemaVersion: skyDarknessSeed.schemaVersion,
    });
  });

  it('stores a bundle whose checksum verifies', async () => {
    const result = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const bundle = JSON.parse(objects.get(result.storagePath)!);

    expect(verifyChecksum(bundle)).toBe(true);
    expect(bundle.checksum).toBe(result.checksum);
  });

  it('refuses content the client could not render', async () => {
    // The fallback exists for content newer than the app; publishing a block
    // type nobody knows is an editorial mistake, not a compatibility case.
    await expect(publishSeed(deps, { seed: unknownBlockSeed, actorUid: ACTOR })).rejects.toBeInstanceOf(
      PublishError
    );

    const seedDoc = await db.collection('seeds').doc(unknownBlockSeed.id).get();
    expect(seedDoc.exists).toBe(false);
    expect(objects.size).toBe(0);
  });

  it('reports which field failed, so the CMS can point at it', async () => {
    const broken: Seed = { ...skyDarknessSeed, sources: [] };

    await expect(publishSeed(deps, { seed: broken, actorUid: ACTOR })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('will not overwrite a published revision', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });

    // A correction is a new revision; the old text stays exactly as answered.
    await expect(
      publishSeed(deps, { seed: { ...skyDarknessSeed, title: 'عنوان تازه' }, actorUid: ACTOR })
    ).rejects.toMatchObject({ code: 'revision-exists' });
  });

  it('keeps the previous revision reachable when a new one lands', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const next = { ...skyDarknessSeed, revision: skyDarknessSeed.revision + 1 };
    await publishSeed(deps, { seed: next, actorUid: ACTOR });

    const seedDoc = await db.collection('seeds').doc(skyDarknessSeed.id).get();
    expect(seedDoc.data()).toMatchObject({
      currentRevision: next.revision,
      previousRevision: skyDarknessSeed.revision,
    });

    // Both artifacts survive: rollback is a pointer move, not a restore.
    expect(objects.has(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision))).toBe(true);
    expect(objects.has(bundleStoragePath(next.id, next.revision))).toBe(true);
  });
});

describe('rollback', () => {
  it('moves the pointer back without deleting anything', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const next = { ...skyDarknessSeed, revision: skyDarknessSeed.revision + 1 };
    await publishSeed(deps, { seed: next, actorUid: ACTOR });

    await rollbackSeed(deps, {
      seedId: skyDarknessSeed.id,
      toRevision: skyDarknessSeed.revision,
      actorUid: 'admin-1',
    });

    const seedDoc = await db.collection('seeds').doc(skyDarknessSeed.id).get();
    expect(seedDoc.data()?.currentRevision).toBe(skyDarknessSeed.revision);

    // The whole manifest moves with the pointer: a device that refreshes after
    // a rollback fetches the older artifact and verifies against its checksum,
    // not the newer one's.
    expect(seedDoc.data()).toMatchObject({
      revision: skyDarknessSeed.revision,
      storagePath: bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision),
    });
    const rolledBackBundle = JSON.parse(
      objects.get(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision))!
    );
    expect(seedDoc.data()?.checksum).toBe(rolledBackBundle.checksum);
    expect(seedDoc.data()?.bytes).toBe(
      Buffer.byteLength(objects.get(bundleStoragePath(skyDarknessSeed.id, skyDarknessSeed.revision))!, 'utf8')
    );

    const newerRevision = await db
      .collection('seedRevisions')
      .doc(`${next.id}_${next.revision}`)
      .get();
    expect(newerRevision.exists).toBe(true);
  });

  it('refuses a revision that was never published', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });

    await expect(
      rollbackSeed(deps, { seedId: skyDarknessSeed.id, toRevision: 99, actorUid: 'admin-1' })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
