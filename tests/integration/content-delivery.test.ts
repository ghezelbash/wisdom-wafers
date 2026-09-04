import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deleteApp as deleteAdminApp, initializeApp as initializeAdmin, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, terminate, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getDownloadURL, getStorage, ref } from 'firebase/storage';

import { publishSeed } from '../../functions/src/publish/publish-seed';
import type { Deps } from '../../functions/src/shared/deps';
import { BundleIntegrityError } from '../../src/data/local/bundle-files';
import { DeviceCatalog, SqlCatalogStore } from '../../src/data/local/device-catalog';
import * as localStore from '../../src/data/local/local-store';
import type { SqlDriver } from '../../src/data/local/sql';
import { FirebaseBundleStorage } from '../../src/data/remote/bundle-storage';
import { RemoteContentSource } from '../../src/data/remote/remote-content-source';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';
import { putObject } from '../support/emulator-rest';
import { nodeBundleFiles } from '../support/node-bundle-files';
import { nodeSqliteDriver } from '../support/node-sqlite-driver';

/**
 * The whole delivery path, end to end: publish → catalogue → download → a
 * relaunch with no network.
 *
 * Nothing here is stubbed on the way in. The bundle is uploaded to the Storage
 * emulator by the publish pipeline and pulled back down by the client through
 * `getDownloadURL` — the same call the device makes — then verified, written to
 * a real directory and committed to a real SQLite database. The point is that a
 * reader who downloads a seed and loses the network still has it, and that a
 * copy which stops matching its checksum is refused rather than rendered.
 */

const BUCKET = 'demo-dananeh.appspot.com';
const ACTOR = 'editor-1';

let admin: App;
let adminDb: AdminFirestore;
let clientApp: FirebaseApp;
let clientDb: Firestore;
let deps: Deps;
let storage: FirebaseBundleStorage;
let dbFile: string;
let dbDirectory: string;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

  admin = initializeAdmin({ projectId: 'demo-dananeh', storageBucket: BUCKET }, 'delivery-admin');
  adminDb = getAdminFirestore(admin);

  clientApp = initializeApp(
    { apiKey: 'demo-key', projectId: 'demo-dananeh', storageBucket: BUCKET },
    'delivery-client'
  );
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8181);

  const bucket = getStorage(clientApp);
  connectStorageEmulator(bucket, '127.0.0.1', 9199);
  // Exactly what the app does: resolve the object path through the SDK, then
  // fetch the URL the SDK produced. The path is never used as a URL.
  storage = new FirebaseBundleStorage((path) => getDownloadURL(ref(bucket, path)));

  deps = {
    db: adminDb,
    async putObject(path, body, contentType) {
      // Uploaded through the emulator's REST API rather than the admin SDK:
      // the bytes are just as real, and the admin client's keep-alive agent
      // kept the process alive after the run finished.
      await putObject(BUCKET, path, body, contentType);
      return `${BUCKET}/${path}`;
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
  dbDirectory = mkdtempSync(join(tmpdir(), 'dananeh-db-'));
  dbFile = join(dbDirectory, 'dananeh.db');

  for (const name of ['seeds', 'seedRevisions', 'topics', 'paths']) {
    const snapshot = await adminDb.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

afterEach(() => {
  rmSync(dbDirectory, { recursive: true, force: true });
});

/** A device: its own SQLite file and its own bundle directory. */
async function openDevice(files: { store: ReturnType<typeof nodeBundleFiles>['store'] }) {
  const driver: SqlDriver = nodeSqliteDriver(dbFile);
  await localStore.open(driver);
  return { driver, catalog: new DeviceCatalog(new SqlCatalogStore(driver), files.store) };
}

describe('publish, download, relaunch offline', () => {
  it('downloads a published bundle from Storage and opens it after a restart with no network', async () => {
    const published = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const files = nodeBundleFiles();

    try {
      // ---- online: refresh the catalogue and keep a copy ------------------
      const source = new RemoteContentSource(clientDb, storage);
      const remote = await source.fetchCatalog();
      expect(remote.seeds).toHaveLength(1);

      const fetched = await source.fetchSeed(remote.seeds[0].manifest);
      expect(fetched.manifest.checksum).toBe(published.checksum);

      const first = await openDevice(files);
      await first.catalog.commitRefresh({
        seeds: [fetched.seed],
        manifests: [fetched.manifest],
        at: remote.fetchedAt,
      });
      const entry = await first.catalog.saveDownload(fetched.manifest, JSON.parse(
        JSON.stringify(fetched.bundle)
      ));
      expect(entry.state).toBe('cached');
      expect(entry.bytes).toBe(published.bytes);
      await first.driver.close();

      // ---- relaunch, no network -------------------------------------------
      const second = await openDevice(files);
      const snapshot = await second.catalog.hydrate();

      expect(snapshot.seeds.map((seed) => seed.id)).toEqual([skyDarknessSeed.id]);
      expect(snapshot.entries[skyDarknessSeed.id].state).toBe('cached');
      expect(snapshot.lastSyncedAt).toBe(remote.fetchedAt);

      const offline = await second.catalog.loadDownload(snapshot.manifests[0]);
      expect(offline.title).toBe(skyDarknessSeed.title);
      expect(offline.blocks).toHaveLength(skyDarknessSeed.blocks.length);
      await second.driver.close();
    } finally {
      files.cleanup();
    }
  });

  it('refuses a bundle whose checksum does not match, and keeps it off the disk', async () => {
    const published = await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const files = nodeBundleFiles();

    try {
      const source = new RemoteContentSource(clientDb, storage);
      const remote = await source.fetchCatalog();
      const { manifest } = remote.seeds[0];
      const { bundle } = await source.fetchSeed(manifest);

      const device = await openDevice(files);
      const tampered = { ...bundle, title: 'عنوان دستکاری‌شده' };

      await expect(device.catalog.saveDownload(manifest, tampered)).rejects.toBeInstanceOf(
        BundleIntegrityError
      );

      // Nothing on the disk, and nothing in the catalogue claiming a copy.
      expect(await files.store.exists(`${manifest.seedId}__${manifest.revision}.json`)).toBe(false);
      const snapshot = await device.catalog.hydrate();
      expect(snapshot.entries[published.seedId]).toBeUndefined();
      await device.driver.close();
    } finally {
      files.cleanup();
    }
  });

  it('marks a kept copy corrupt when the file stops matching, instead of rendering it', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const files = nodeBundleFiles();

    try {
      const source = new RemoteContentSource(clientDb, storage);
      const remote = await source.fetchCatalog();
      const fetched = await source.fetchSeed(remote.seeds[0].manifest);

      const first = await openDevice(files);
      await first.catalog.commitRefresh({
        seeds: [fetched.seed],
        manifests: [fetched.manifest],
        at: remote.fetchedAt,
      });
      await first.catalog.saveDownload(fetched.manifest, JSON.parse(JSON.stringify(fetched.bundle)));
      await first.driver.close();

      // The disk rots between launches.
      files.corrupt(`${fetched.manifest.seedId}__${fetched.manifest.revision}.json`);

      const second = await openDevice(files);
      const snapshot = await second.catalog.hydrate();

      expect(snapshot.entries[skyDarknessSeed.id].state).toBe('corrupt');
      await expect(second.catalog.loadDownload(fetched.manifest)).rejects.toBeInstanceOf(
        BundleIntegrityError
      );

      // The state survives the next launch too, so the card keeps offering the
      // one thing that fixes it.
      await second.driver.close();
      const third = await openDevice(files);
      expect((await third.catalog.hydrate()).entries[skyDarknessSeed.id].state).toBe('corrupt');
      await third.driver.close();
    } finally {
      files.cleanup();
    }
  });

  it('deletes both halves when a download is removed', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const files = nodeBundleFiles();

    try {
      const source = new RemoteContentSource(clientDb, storage);
      const remote = await source.fetchCatalog();
      const fetched = await source.fetchSeed(remote.seeds[0].manifest);
      const name = `${fetched.manifest.seedId}__${fetched.manifest.revision}.json`;

      const first = await openDevice(files);
      await first.catalog.commitRefresh({
        seeds: [fetched.seed],
        manifests: [fetched.manifest],
        at: remote.fetchedAt,
      });
      await first.catalog.saveDownload(fetched.manifest, JSON.parse(JSON.stringify(fetched.bundle)));
      await first.catalog.removeDownload(skyDarknessSeed.id);
      await first.driver.close();

      expect(await files.store.exists(name)).toBe(false);

      // A deleted download does not come back on the next launch.
      const second = await openDevice(files);
      const snapshot = await second.catalog.hydrate();
      expect(snapshot.entries[skyDarknessSeed.id]).toBeUndefined();
      // The seed itself is still listable — only the kept copy went.
      expect(snapshot.seeds.map((seed) => seed.id)).toEqual([skyDarknessSeed.id]);
      await second.driver.close();
    } finally {
      files.cleanup();
    }
  });

  it('leaves the last good catalogue alone when a refresh fails', async () => {
    await publishSeed(deps, { seed: skyDarknessSeed, actorUid: ACTOR });
    const files = nodeBundleFiles();

    try {
      const source = new RemoteContentSource(clientDb, storage);
      const remote = await source.fetchCatalog();
      const fetched = await source.fetchSeed(remote.seeds[0].manifest);

      const device = await openDevice(files);
      await device.catalog.commitRefresh({
        seeds: [fetched.seed],
        manifests: [fetched.manifest],
        at: '2026-09-03T12:00:00.000Z',
      });

      // The next refresh cannot reach Storage at all.
      const offlineSource = new RemoteContentSource(clientDb, {
        async fetch() {
          throw new Error('offline');
        },
      });
      const nextCatalog = await offlineSource.fetchCatalog();
      const results = await Promise.all(
        nextCatalog.seeds.map((summary) => offlineSource.fetchSeed(summary.manifest).catch(() => null))
      );
      expect(results.every((result) => result === null)).toBe(true);

      // Nothing committed, so nothing changed — including the sync point, which
      // must not claim a freshness the content does not have.
      const snapshot = await device.catalog.hydrate();
      expect(snapshot.seeds.map((seed) => seed.id)).toEqual([skyDarknessSeed.id]);
      expect(snapshot.lastSyncedAt).toBe('2026-09-03T12:00:00.000Z');
      await device.driver.close();
    } finally {
      files.cleanup();
    }
  });
});
