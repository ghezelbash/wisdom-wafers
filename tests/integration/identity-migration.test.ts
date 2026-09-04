import { deleteApp as deleteAdminApp, initializeApp as initializeAdmin, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';

import { ingestProgressEvents } from '../../functions/src/progress/ingest';
import type { Deps } from '../../functions/src/shared/deps';
import { SqlOutboxStore } from '../../src/data/local/outbox-store';
import * as localStore from '../../src/data/local/local-store';
import type { SqlDriver } from '../../src/data/local/sql';
import { migrateIdentity } from '../../src/domain/identity/migration';
import { recordCompletion } from '../../src/domain/progress/events';
import { __setOutboxStore, flush, listOutbox, type OutboxItem } from '../../src/lib/outbox';
import { outcomeFor } from '../../src/lib/outbox-ack';
import { nodeSqliteDriver } from '../support/node-sqlite-driver';

/**
 * Fresh install → guest use → completion → signup, against the real backend.
 *
 * The account offer promises that nothing is lost. That promise has two halves:
 * `linkWithCredential` keeps the uid when there was an anonymous session, and
 * identity migration carries the queue when there was not — the local-only
 * recovery path, and the reader who signs into an account they already had.
 */

let admin: App;
let adminDb: AdminFirestore;
let clientApp: FirebaseApp;
let auth: Auth;
let deps: Deps;
let driver: SqlDriver;

const PASSWORD = 'seed-password-1405';
const anEmail = () => `reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  admin = initializeAdmin({ projectId: 'demo-dananeh' }, 'identity-migration-admin');
  adminDb = getAdminFirestore(admin);

  clientApp = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dananeh' }, 'identity-migration');
  auth = getAuth(clientApp);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

  deps = {
    db: adminDb,
    async putObject(path) {
      return path;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => new Date('2026-09-04T12:00:00.000Z'),
  };
});

afterAll(async () => {
  // The admin Firestore keeps a gRPC channel that `deleteApp` does not
  // close, which leaves the process alive after the run finishes.
  await adminDb.terminate();
  await deleteAdminApp(admin);
  await deleteApp(clientApp);
});

beforeEach(async () => {
  driver = nodeSqliteDriver();
  await localStore.open(driver);
  __setOutboxStore(new SqlOutboxStore(driver));
  await signOut(auth).catch(() => {});
});

afterEach(async () => {
  __setOutboxStore(null);
  await driver.close();
});

/**
 * The device's finished seeds, straight out of SQLite.
 *
 * The key-value repository above it needs React Native modules this Node suite
 * does not have, which is exactly why the reader is injectable.
 */
const readProgress = async () =>
  (await localStore.listProgress(driver)).map((item) => ({
    seedId: item.seedId,
    revision: item.revision,
    completedAt: item.completedAt,
  }));

const markCompleted = (seedId: string) =>
  localStore.saveProgress(driver, {
    seedId,
    revision: 3,
    blockIndex: 5,
    status: 'completed',
    saved: false,
    answers: {},
    completedAt: '2026-09-01T10:00:00.000Z',
    reviewCount: 0,
    updatedAt: '2026-09-01T10:00:00.000Z',
  });

/** Drains the queue as the caller the events must belong to. */
const drainAs = (uid: string) =>
  flush(
    async (item: OutboxItem) =>
      outcomeFor(item, await ingestProgressEvents(deps, { uid, events: [item.payload] })),
    true
  );

const completedSeeds = async (uid: string) => {
  const snapshot = await adminDb.collection(`users/${uid}/progress`).get();
  return snapshot.docs
    .filter((document) => document.data().status === 'completed')
    .map((document) => document.id)
    .sort();
};

describe('a guest who was never online, then signs up', () => {
  it('keeps every completion when the device-only uid becomes a real one', async () => {
    // Launch with no backend: a device-local uid, and a seed finished on it.
    const localUid = 'local-abc-123';
    await recordCompletion({ uid: localUid, seedId: 'seed-sky-darkness', revision: 4 });

    // The network comes back and Firebase issues an anonymous uid. Recovery
    // hands the queue over rather than stranding it.
    const anonymous = await signInAnonymously(auth);
    await migrateIdentity(localUid, anonymous.user.uid);

    expect((await listOutbox())[0].payload.uid).toBe(anonymous.user.uid);
    expect(await drainAs(anonymous.user.uid)).toMatchObject({ sent: 1, remaining: 0 });
    expect(await completedSeeds(anonymous.user.uid)).toEqual(['seed-sky-darkness']);
  });

  /** Without the rewrite this is the bug: the event names an owner the caller
   *  is not, and the completion dies in the queue. */
  it('would otherwise lose the completion to a uid mismatch', async () => {
    const anonymous = await signInAnonymously(auth);
    await recordCompletion({ uid: 'local-abc-123', seedId: 'seed-sky-darkness', revision: 4 });

    expect(await drainAs(anonymous.user.uid)).toMatchObject({ rejected: 1, remaining: 1 });
    expect((await listOutbox())[0].lastError).toContain('uid-mismatch');
    expect(await completedSeeds(anonymous.user.uid)).toEqual([]);
  });
});

describe('signing into an account that already existed', () => {
  it('brings this device’s finished seeds to the account', async () => {
    // A guest reads two seeds on this device.
    const guest = await signInAnonymously(auth);
    for (const seedId of ['seed-one', 'seed-two']) await markCompleted(seedId);
    await recordCompletion({ uid: guest.user.uid, seedId: 'seed-one', revision: 3 });
    await drainAs(guest.user.uid);

    // They then sign into an account made on another device.
    const email = anEmail();
    const existing = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const accountUid = existing.user.uid;
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, PASSWORD);

    expect(accountUid).not.toBe(guest.user.uid);

    await migrateIdentity(guest.user.uid, accountUid, { announce: true, read: readProgress });
    await drainAs(accountUid);

    expect(await completedSeeds(accountUid)).toEqual(['seed-one', 'seed-two']);
    // The guest's own record is untouched: migration copies forward, it does
    // not reach back and delete.
    expect(await completedSeeds(guest.user.uid)).toEqual(['seed-one']);
  });

  it('counts nothing twice when the reader signs in again', async () => {
    const guest = await signInAnonymously(auth);
    await markCompleted('seed-one');

    const email = anEmail();
    const account = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const uid = account.user.uid;

    await migrateIdentity(guest.user.uid, uid, { announce: true, read: readProgress });
    await drainAs(uid);
    const afterFirst = (await adminDb.collection(`users/${uid}/eventLog`).get()).size;

    // Sign out, sign back in: the backfill runs again with the same ids.
    await migrateIdentity(guest.user.uid, uid, { announce: true, read: readProgress });
    const result = await drainAs(uid);

    expect(result.duplicates).toBeGreaterThan(0);
    expect(result.sent).toBe(0);
    expect((await adminDb.collection(`users/${uid}/eventLog`).get()).size).toBe(afterFirst);
  });
});
