import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  accountDeletionStatus,
  beginAccountDeletion,
  deleteAccount,
  DeletionError,
  isRecentLogin,
  isWellFormedReceipt,
  MAX_RECEIPT_DIGESTS,
  mintReceipt,
  receiptDigest,
  RECEIPT_VERSION,
  RECENT_LOGIN_WINDOW_SECONDS,
  USER_SUBCOLLECTIONS,
} from '../../functions/src/account/delete';
import { ingestProgressEvents } from '../../functions/src/progress/ingest';
import { submitReports } from '../../functions/src/reports/submit';
import type { Deps } from '../../functions/src/shared/deps';
import { accountExists, createAccount, deleteAccount as deleteEmulatorAccount } from '../support/emulator-rest';

/**
 * Account deletion, proved rather than promised.
 *
 * The screen names what is destroyed. This asserts each of those things is
 * actually gone from the server — and that a job which dies halfway can be run
 * again without producing an inconsistent state or a second, conflicting
 * outcome.
 */

const PROJECT = 'demo-dananeh';
const UID = 'reader-to-delete';
const NOW = new Date('2026-09-04T12:00:00.000Z');

let app: App;
let db: Firestore;
let objects: Map<string, string>;
let deletedUsers: string[];
let deps: Deps;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  app = initializeApp({ projectId: PROJECT }, 'account-lifecycle');
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
  deletedUsers = [];

  deps = {
    db,
    async putObject(path, body) {
      objects.set(path, body);
      return path;
    },
    async deleteObjects(prefix) {
      const matched = [...objects.keys()].filter((key) => key.startsWith(prefix));
      for (const key of matched) objects.delete(key);
      return matched.length;
    },
    async deleteAuthUser(uid) {
      deletedUsers.push(uid);
      // Through the emulator's REST API rather than the admin SDK, whose
      // keep-alive agent outlived the run. Tolerant of an account that is
      // already gone, exactly like the production implementation.
      await deleteEmulatorAccount(PROJECT, uid).catch(() => undefined);
    },
    now: () => NOW,
  };

  for (const name of [...USER_SUBCOLLECTIONS, 'progress']) {
    const snapshot = await db.collection(`users/${UID}/${name}`).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
  for (const path of [`users/${UID}`, `userStats/${UID}`, `entitlements/${UID}`, `deletionJobs/${UID}`]) {
    await db.doc(path).delete();
  }
  const reports = await db.collection('reports').get();
  await Promise.all(reports.docs.map((document) => document.ref.delete()));
});

const recentAuth = NOW.getTime() / 1000 - 30;

/** A reader with something in every place deletion has to reach. */
async function seedAccount() {
  await db.doc(`users/${UID}`).set({ locale: 'fa-IR', interests: ['psychology'] });
  await ingestProgressEvents(deps, {
    uid: UID,
    events: [
      {
        id: 'event-00001',
        uid: UID,
        seedId: 'seed-sky-darkness',
        revision: 4,
        type: 'completed',
        occurredAtDevice: '2026-09-03T11:00:00.000Z',
        timezone: 'Asia/Tehran',
        appVersion: '1.0.0',
      },
    ],
  });
  await db.doc(`users/${UID}/saved/seed-sky-darkness`).set({ seedId: 'seed-sky-darkness' });
  await db.doc(`users/${UID}/reviews/review-1`).set({ seedId: 'seed-sky-darkness', confidence: 'good' });
  await db.doc(`users/${UID}/devices/device-1`).set({ pushToken: 'ExponentPushToken[xxx]' });
  await db.doc(`feeds/${UID}/items/item-1`).set({ seedId: 'seed-sky-darkness' });
  await db.doc(`entitlements/${UID}`).set({ tier: 'free' });

  await submitReports(deps, {
    uid: UID,
    reports: [
      {
        id: 'report-0001',
        uid: UID,
        seedId: 'seed-sky-darkness',
        revision: 4,
        category: 'factual',
        occurredAtDevice: '2026-09-03T11:00:00.000Z',
        appVersion: '1.0.0',
      },
    ],
  });

  objects.set(`users/${UID}/upload.png`, 'bytes');
  objects.set(`quarantine/users/${UID}/pending.png`, 'bytes');
  objects.set('content/seeds/other/1/bundle.json', 'not this reader');
}

const remaining = async (path: string) => (await db.collection(path).get()).size;

describe('requiring a recent sign-in', () => {
  it('accepts a sign-in inside the window and refuses one outside it', () => {
    expect(isRecentLogin(NOW.getTime() / 1000 - 30, NOW)).toBe(true);
    expect(isRecentLogin(NOW.getTime() / 1000 - RECENT_LOGIN_WINDOW_SECONDS - 1, NOW)).toBe(false);
    expect(isRecentLogin(undefined, NOW)).toBe(false);
  });

  it('deletes nothing when the sign-in is stale', async () => {
    await seedAccount();

    await expect(
      deleteAccount(deps, { uid: UID, authTimeSeconds: NOW.getTime() / 1000 - 3600 })
    ).rejects.toBeInstanceOf(DeletionError);

    expect((await db.doc(`users/${UID}`).get()).exists).toBe(true);
    expect(await remaining(`users/${UID}/progress`)).toBe(1);
    expect(deletedUsers).toEqual([]);
  });
});

describe('deleting everything', () => {
  it('reaches every place a client cannot', async () => {
    await seedAccount();

    const result = await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });
    expect(result.state).toBe('done');

    for (const name of USER_SUBCOLLECTIONS) {
      expect(await remaining(`users/${UID}/${name}`)).toBe(0);
    }
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(false);
    expect((await db.doc(`userStats/${UID}`).get()).exists).toBe(false);
    expect((await db.doc(`entitlements/${UID}`).get()).exists).toBe(false);
    expect(await remaining(`feeds/${UID}/items`)).toBe(0);

    // Push tokens go with the devices they were registered on.
    expect(await remaining(`users/${UID}/devices`)).toBe(0);

    // Storage: the reader's files, and only theirs.
    expect(objects.has(`users/${UID}/upload.png`)).toBe(false);
    expect(objects.has(`quarantine/users/${UID}/pending.png`)).toBe(false);
    expect(objects.has('content/seeds/other/1/bundle.json')).toBe(true);

    expect(deletedUsers).toEqual([UID]);
  });

  /**
   * The Auth record itself, not just the request for it.
   *
   * `deletedUsers` proves the job asked; this proves the account is actually
   * gone, which is the half a reader is promised.
   */
  it('removes the Auth account, verified against the emulator', async () => {
    const email = `delete-me-${Date.now()}@example.com`;
    const uid = await createAccount(PROJECT, email, 'seed-password-1405');
    expect(await accountExists(PROJECT, uid)).toBe(true);

    await deleteAccount(deps, { uid, authTimeSeconds: recentAuth });

    expect(await accountExists(PROJECT, uid)).toBe(false);
  });

  /**
   * A report is a record about *content*, and the team may still be acting on
   * it. The reporter is the only personal thing in it.
   */
  it('anonymises reports rather than destroying the moderation trail', async () => {
    await seedAccount();
    await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });

    const report = await db.doc('reports/report-0001').get();
    expect(report.exists).toBe(true);
    expect(report.data()).toMatchObject({ uid: 'deleted', seedId: 'seed-sky-darkness' });
  });

  it('records the job, so support can see what happened', async () => {
    await seedAccount();
    await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });

    const job = (await db.doc(`deletionJobs/${UID}`).get()).data();
    expect(job).toMatchObject({ uid: UID, state: 'done', finishedAt: NOW.toISOString() });
    expect(job?.completed).toEqual(expect.arrayContaining(['auth', 'storage', 'user-document']));
  });
});

describe('a deletion that dies halfway', () => {
  it('resumes rather than restarting, and finishes cleanly', async () => {
    await seedAccount();

    // Storage is unreachable on the first run: everything before it is done,
    // and the job is marked failed at that step.
    const failing: Deps = {
      ...deps,
      async deleteObjects() {
        throw new Error('bucket unreachable');
      },
    };

    await expect(
      deleteAccount(failing, { uid: UID, authTimeSeconds: recentAuth })
    ).rejects.toMatchObject({ code: 'failed', step: 'storage' });

    const failed = (await db.doc(`deletionJobs/${UID}`).get()).data();
    expect(failed?.state).toBe('failed');
    expect(failed?.completed).toEqual(expect.arrayContaining(['users/progress']));

    // The account is still signed-in-able, which is what lets the reader retry.
    expect(deletedUsers).toEqual([]);

    // The retry picks up where it stopped.
    const result = await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });
    expect(result.state).toBe('done');
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(false);
    expect(deletedUsers).toEqual([UID]);
  });

  it('is safe to run again after it already finished', async () => {
    await seedAccount();
    await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });

    const second = await deleteAccount(deps, { uid: UID, authTimeSeconds: recentAuth });
    expect(second.state).toBe('done');
    expect((await db.doc(`deletionJobs/${UID}`).get()).data()?.state).toBe('done');
  });
});

/**
 * The window after the Auth record is gone.
 *
 * Auth is deleted last, so a response lost after that step leaves a device that
 * can no longer authenticate — and without a receipt it could neither finish
 * the job nor find out whether it had finished. It would have to guess whether
 * its data still existed, and every possible guess is wrong some of the time.
 */
describe('a deletion whose response went missing', () => {
  it('mints a receipt before destroying anything', async () => {
    await seedAccount();

    const begun = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    // 256 bits, base64url — exactly 43 characters, URL and callable safe.
    expect(begun.receipt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(begun.state).toBe('requested');
    // Nothing is gone yet: this step only proves who is asking.
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(true);
    expect(await remaining(`users/${UID}/progress`)).toBe(1);
  });

  /**
   * The receipt itself is never stored, so a second `begin` cannot hand back
   * the first one — and must not invalidate it either. Both stay valid on the
   * same job.
   */
  it('keeps the first receipt working when the request is made twice', async () => {
    await seedAccount();

    const first = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });
    const again = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    expect(again.receipt).not.toBe(first.receipt);
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: first.receipt })).not.toBeNull();
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: again.receipt })).not.toBeNull();

    // The same job, continued — not a second one started.
    const job = (await db.doc(`deletionJobs/${UID}`).get()).data();
    expect(job?.startedAt).toBe(NOW.toISOString());
    expect(job?.receiptDigests).toHaveLength(2);
  });

  it('keeps at most three live capabilities', async () => {
    await seedAccount();

    const receipts = [];
    for (let round = 0; round < 5; round += 1) {
      receipts.push((await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth })).receipt);
    }

    const job = (await db.doc(`deletionJobs/${UID}`).get()).data();
    expect(job?.receiptDigests).toHaveLength(MAX_RECEIPT_DIGESTS);

    // The three most recent still work; the two it dropped do not.
    for (const receipt of receipts.slice(-MAX_RECEIPT_DIGESTS)) {
      expect(await accountDeletionStatus(deps, { uid: UID, receipt })).not.toBeNull();
    }
    for (const receipt of receipts.slice(0, 2)) {
      expect(await accountDeletionStatus(deps, { uid: UID, receipt })).toBeNull();
    }
  });

  it('finishes with the receipt after the session is gone', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    // No `authTimeSeconds` at all — the account it belonged to no longer
    // exists, which is the state this has to work in.
    const result = await deleteAccount(deps, { uid: UID, receipt });

    expect(result.state).toBe('done');
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(false);
    expect(deletedUsers).toEqual([UID]);
  });

  it('answers what happened, for a device that cannot authenticate', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });
    await deleteAccount(deps, { uid: UID, receipt });

    const status = await accountDeletionStatus(deps, { uid: UID, receipt });
    expect(status?.state).toBe('done');
    expect(status?.completed).toEqual(expect.arrayContaining(['auth']));
  });

  it('says nothing at all to a wrong receipt', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    // A guess, a truncation, a re-encoding, and the right receipt against the
    // wrong uid. Every one of them gets the same answer as "no such job".
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: mintReceipt() })).toBeNull();
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: receipt.slice(0, 42) })).toBeNull();
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: `${receipt}A` })).toBeNull();
    expect(await accountDeletionStatus(deps, { uid: UID, receipt: '' })).toBeNull();
    expect(await accountDeletionStatus(deps, { uid: 'someone-else', receipt })).toBeNull();
  });

  /**
   * The property the plaintext version did not have: a reader of the database
   * — a backup, an export, an operator with console access — holds something
   * that cannot be replayed.
   */
  it('stores a digest and never the receipt', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    const job = (await db.doc(`deletionJobs/${UID}`).get()).data();
    const serialised = JSON.stringify(job);

    expect(serialised).not.toContain(receipt);
    expect(job?.receipt).toBeUndefined();
    expect(job?.receiptVersion).toBe(RECEIPT_VERSION);
    expect(job?.receiptDigests).toEqual([receiptDigest(receipt)]);
    expect(job?.receiptDigests[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a receipt that is not the shape a receipt has', async () => {
    await seedAccount();
    await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    for (const value of [undefined, null, 42, {}, 'x', 'A'.repeat(44), 'A'.repeat(42), 'a/b+c']) {
      expect(isWellFormedReceipt(value)).toBe(false);
      expect(await accountDeletionStatus(deps, { uid: UID, receipt: value as string })).toBeNull();
    }
  });

  it('mints a different receipt every time', () => {
    // `Math.random` produced 128 predictable bits described in the comments as
    // 256 bits of secret. Both halves of that were wrong.
    const minted = new Set(Array.from({ length: 200 }, () => mintReceipt()));
    expect(minted.size).toBe(200);
  });

  it('refuses to delete for a receipt that does not match', async () => {
    await seedAccount();
    await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    await expect(
      deleteAccount(deps, { uid: UID, receipt: mintReceipt() })
    ).rejects.toMatchObject({ code: 'requires-recent-login' });

    // And nothing was touched on the way to refusing.
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(true);
  });

  /** A resumed run after a mid-flight failure must not double-delete. */
  it('resumes with the receipt after a failure partway', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    const failing: Deps = {
      ...deps,
      async deleteObjects() {
        throw new Error('bucket unreachable');
      },
    };

    await expect(deleteAccount(failing, { uid: UID, receipt })).rejects.toMatchObject({
      step: 'storage',
    });
    // Still signed-in-able, which is what lets the reader retry.
    expect(deletedUsers).toEqual([]);

    const result = await deleteAccount(deps, { uid: UID, receipt });
    expect(result.state).toBe('done');
    expect(deletedUsers).toEqual([UID]);
  });

  it('is safe to run again with the receipt once it is done', async () => {
    await seedAccount();
    const { receipt } = await beginAccountDeletion(deps, { uid: UID, authTimeSeconds: recentAuth });

    await deleteAccount(deps, { uid: UID, receipt });
    const second = await deleteAccount(deps, { uid: UID, receipt });

    expect(second.state).toBe('done');
    expect((await db.doc(`deletionJobs/${UID}`).get()).data()?.state).toBe('done');
  });

  it('still refuses a stale sign-in when there is no receipt', async () => {
    await seedAccount();

    await expect(
      deleteAccount(deps, { uid: UID, authTimeSeconds: NOW.getTime() / 1000 - 3600 })
    ).rejects.toMatchObject({ code: 'requires-recent-login' });
    await expect(
      beginAccountDeletion(deps, { uid: UID, authTimeSeconds: NOW.getTime() / 1000 - 3600 })
    ).rejects.toBeInstanceOf(DeletionError);
  });
});
