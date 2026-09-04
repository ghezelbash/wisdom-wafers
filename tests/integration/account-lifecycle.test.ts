import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  deleteAccount,
  DeletionError,
  isRecentLogin,
  RECENT_LOGIN_WINDOW_SECONDS,
  USER_SUBCOLLECTIONS,
} from '../../functions/src/account/delete';
import { ingestProgressEvents } from '../../functions/src/progress/ingest';
import { submitReports } from '../../functions/src/reports/submit';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * Account deletion, proved rather than promised.
 *
 * The screen names what is destroyed. This asserts each of those things is
 * actually gone from the server — and that a job which dies halfway can be run
 * again without producing an inconsistent state or a second, conflicting
 * outcome.
 */

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
  app = initializeApp({ projectId: 'demo-dananeh' }, 'account-lifecycle');
  db = getFirestore(app);
});

afterAll(async () => {
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
      await getAdminAuth(app).deleteUser(uid).catch(() => undefined);
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
