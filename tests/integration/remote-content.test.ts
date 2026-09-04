import { deleteApp as deleteAdminApp, initializeApp as initializeAdmin, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, terminate, type Firestore } from 'firebase/firestore';

import { publishSeed } from '../../functions/src/publish/publish-seed';
import type { Deps } from '../../functions/src/shared/deps';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';
import {
  ContentIntegrityError,
  RemoteContentSource,
} from '../../src/data/remote/remote-content-source';
import {
  BundleTransportError,
  FirebaseBundleStorage,
  assertStoragePath,
} from '../../src/data/remote/bundle-storage';
import { memoryBundleStorage } from '../support/memory-bundle-storage';

/**
 * Publish, then read it back the way the app does.
 *
 * This is the seam the whole content pipeline exists to make safe: an editor
 * publishes, and a client gets exactly those bytes or refuses them.
 */

let admin: App;
let adminDb: AdminFirestore;
let objects: Map<string, string>;
let deps: Deps;
let source: RemoteContentSource;
let clientApp: ReturnType<typeof initializeApp>;
let clientDb: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  admin = initializeAdmin({ projectId: 'demo-dananeh' }, 'remote-content-admin');
  adminDb = getAdminFirestore(admin);

  clientApp = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dananeh' }, 'remote-content-client');
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8181);

  objects = new Map();
  source = new RemoteContentSource(clientDb, memoryBundleStorage(objects));

  deps = {
    db: adminDb,
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
});

afterAll(async () => {
  // The admin Firestore keeps a gRPC channel that `deleteApp` does not
  // close, which leaves the process alive after the run finishes.
  await adminDb.terminate();
  // `deleteApp` alone leaves the Firestore gRPC channel open, which keeps the
  // Jest worker alive after the run finishes.
  await terminate(clientDb);
  await deleteAdminApp(admin);
  await deleteApp(clientApp);
});

beforeEach(async () => {
  objects.clear();
  for (const name of ['seeds', 'seedRevisions', 'topics', 'paths']) {
    const snapshot = await adminDb.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

describe('publish then read', () => {
  it('returns the published seed to a client, blocks and all', async () => {
    const published = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-1' });

    const catalog = await source.fetchCatalog();
    expect(catalog.seeds).toHaveLength(1);
    expect(catalog.seeds[0]).toMatchObject({
      seedId: skyDarknessSeed.id,
      currentRevision: skyDarknessSeed.revision,
    });

    // The manifest is complete enough to fetch and verify without a second read.
    expect(catalog.seeds[0].manifest).toEqual({
      seedId: skyDarknessSeed.id,
      revision: skyDarknessSeed.revision,
      storagePath: published.storagePath,
      checksum: published.checksum,
      bytes: published.bytes,
      schemaVersion: skyDarknessSeed.schemaVersion,
      publishedAt: '2026-09-03T12:00:00.000Z',
    });

    const { seed } = await source.fetchSeed(catalog.seeds[0].manifest);
    expect(seed.title).toBe(skyDarknessSeed.title);
    expect(seed.promise).toBe(skyDarknessSeed.promise);
    expect(seed.blocks).toHaveLength(skyDarknessSeed.blocks.length);
    expect(seed.difficulty).toBe(skyDarknessSeed.difficulty);
  });

  it('leaves unpublished seeds out of the catalogue', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-1' });
    await adminDb.collection('seeds').doc('draft-seed').set({ status: 'draft', title: 'draft' });

    const catalog = await source.fetchCatalog();
    expect(catalog.seeds.map((seed) => seed.seedId)).toEqual([skyDarknessSeed.id]);
  });

  it('drops a published document whose manifest is incomplete', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-1' });
    // A document written by something other than the publish Function: there is
    // nothing a device could fetch or verify, so it is not half-listed.
    await adminDb.collection('seeds').doc('hand-written').set({
      status: 'published',
      seedId: 'hand-written',
      title: 'بدون manifest',
      currentRevision: 1,
    });

    const catalog = await source.fetchCatalog();
    expect(catalog.seeds.map((seed) => seed.seedId)).toEqual([skyDarknessSeed.id]);
  });

  it('refuses a bundle whose bytes do not match the published checksum', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-1' });
    const catalog = await source.fetchCatalog();
    const { manifest } = catalog.seeds[0];

    // A truncated download and a tampered one are indistinguishable here, and
    // both are fixed the same way: fetch it again.
    const tampered = JSON.parse(objects.get(manifest.storagePath)!);
    tampered.title = 'عنوان دستکاری‌شده';
    objects.set(manifest.storagePath, JSON.stringify(tampered));

    await expect(source.fetchSeed(manifest)).rejects.toBeInstanceOf(ContentIntegrityError);
  });

  it('refuses a bundle that is not a bundle at all', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: 'editor-1' });
    const catalog = await source.fetchCatalog();
    const { manifest } = catalog.seeds[0];
    objects.set(manifest.storagePath, JSON.stringify({ nothing: 'useful' }));

    await expect(source.fetchSeed(manifest)).rejects.toBeInstanceOf(ContentIntegrityError);
  });
});

describe('the storage path is a path, not a URL', () => {
  it('refuses a manifest that smuggles an origin into the transport', async () => {
    for (const hostile of [
      'https://evil.example/bundle.json',
      'http://127.0.0.1:9199/anything',
      '/absolute/bundle.json',
      'content/../../etc/passwd',
    ]) {
      expect(() => assertStoragePath(hostile)).toThrow(BundleTransportError);
    }
  });

  it('resolves an object path through the SDK before fetching', async () => {
    const resolved: string[] = [];
    const storage = new FirebaseBundleStorage(
      async (path) => {
        resolved.push(path);
        return `https://storage.example/download?token=${encodeURIComponent(path)}`;
      },
      (async (url: string) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ url }),
      })) as unknown as typeof fetch
    );

    const result = await storage.fetch('content/seeds/a/1/bundle.json');
    expect(resolved).toEqual(['content/seeds/a/1/bundle.json']);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('reports an unreachable object rather than returning nothing', async () => {
    const storage = new FirebaseBundleStorage(
      async () => 'https://storage.example/missing',
      (async () => ({ ok: false, status: 404, text: async () => '' })) as unknown as typeof fetch
    );

    await expect(storage.fetch('content/seeds/a/1/bundle.json')).rejects.toMatchObject({
      name: 'BundleTransportError',
      reason: 'http-404',
    });
  });
});
