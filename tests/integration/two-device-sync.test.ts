import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { ingestProgressEvents } from '../../functions/src/progress/ingest';
import type { Deps } from '../../functions/src/shared/deps';
import { mergeProgressLists, mergeReviews, mergeSaved, savedSeedIds } from '../../src/domain/account/sync';

/**
 * Two devices, one account.
 *
 * Device A reads, bookmarks and reviews; device B signs in and has to end up
 * with the same picture. The server half runs for real — events through
 * `ingestProgressEvents`, documents read back out of Firestore — and the merge
 * half is the same policy the app uses.
 *
 * The failures being guarded against are all silent ones: a resume position
 * that never leaves the first device, a review schedule that resets and puts a
 * seed back in the queue, and an un-save that never travels.
 */

const UID = 'two-device-reader';
const SEED = 'seed-anchoring';
const NOW = new Date('2026-09-05T12:00:00.000Z');

let app: App;
let db: Firestore;
let deps: Deps;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'two-device-sync');
  db = getFirestore(app);
  deps = {
    db,
    async putObject(path) {
      return path;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => NOW,
  };
});

afterAll(async () => {
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  for (const name of ['progress', 'reviews', 'saved', 'eventLog']) {
    const snapshot = await db.collection(`users/${UID}/${name}`).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
  await db.doc(`userStats/${UID}`).delete();
});

let sequence = 0;
const event = (overrides: Record<string, unknown>) => ({
  id: `two-device-${NOW.getTime()}-${(sequence += 1)}`,
  uid: UID,
  seedId: SEED,
  revision: 1,
  occurredAtDevice: NOW.toISOString(),
  timezone: 'Asia/Tehran',
  appVersion: '1.0.0',
  ...overrides,
});

const send = (...events: Record<string, unknown>[]) =>
  ingestProgressEvents(deps, { uid: UID, events });

/** What device B pulls down when it signs in. */
async function pull() {
  const [progress, reviews, saved] = await Promise.all([
    db.collection(`users/${UID}/progress`).get(),
    db.collection(`users/${UID}/reviews`).get(),
    db.collection(`users/${UID}/saved`).get(),
  ]);

  return {
    progress: progress.docs.map((document) => {
      const data = document.data();
      return {
        seedId: document.id,
        revision: data.revision,
        blockIndex: data.blockIndex ?? 0,
        status: data.status,
        percent: data.percent,
        completedAt: data.completedAt,
        updatedAt: data.updatedAt,
      };
    }),
    reviews: reviews.docs.map((document) => {
      const data = document.data();
      return {
        seedId: document.id,
        reviewedAt: data.reviewedAt,
        interval: data.interval,
        dueAt: data.dueAt,
        count: data.count,
      };
    }),
    saved: saved.docs.map((document) => document.data() as { seedId: string; saved: boolean; updatedAt: string }),
  };
}

describe('the resume position reaches the second device', () => {
  it('travels with the events rather than staying on the first device', async () => {
    await send(event({ type: 'block_viewed', blockIndex: 4 }));

    const { progress } = await pull();
    expect(progress[0]).toMatchObject({ seedId: SEED, blockIndex: 4, status: 'in_progress' });
  });

  /** The queue delivers out of order; a late arrival must not drag a reader back. */
  it('only ever moves forward within a revision', async () => {
    await send(event({ type: 'block_viewed', blockIndex: 7 }));
    await send(event({ type: 'block_viewed', blockIndex: 2 }));

    expect((await pull()).progress[0].blockIndex).toBe(7);
  });

  it('lets a newer revision replace the position outright', async () => {
    await send(event({ type: 'block_viewed', blockIndex: 7 }));
    await send(event({ type: 'block_viewed', blockIndex: 1, revision: 2 }));

    const [progress] = (await pull()).progress;
    expect(progress).toMatchObject({ revision: 2, blockIndex: 1 });
  });
});

describe('review state survives signing in elsewhere', () => {
  it('records the schedule the rating bought, derived server-side', async () => {
    await send(event({ type: 'completed', blockIndex: 9 }));
    await send(event({ type: 'reviewed', confidence: 'easy' }));

    const [review] = (await pull()).reviews;
    expect(review).toMatchObject({ seedId: SEED, interval: 14, count: 1 });
    // Fourteen days after the review, not after the server happened to run.
    expect(review.dueAt).toBe('2026-09-19T12:00:00.000Z');
  });

  it('counts every review, across devices', async () => {
    await send(event({ type: 'reviewed', confidence: 'good' }));
    await send(event({ type: 'reviewed', confidence: 'hard' }));

    const [review] = (await pull()).reviews;
    expect(review.count).toBe(2);
    // The most recent rating owns the schedule.
    expect(review.interval).toBe(3);
  });

  it('counts a retried review once', async () => {
    const reviewed = event({ type: 'reviewed', confidence: 'good' });
    await send(reviewed);
    const again = await send(reviewed);

    expect(again.duplicates).toBe(1);
    expect((await pull()).reviews[0].count).toBe(1);
  });

  /**
   * The failure this prevents: device B signs in, sees no local review state,
   * and puts a seed back in today's queue that device A answered yesterday.
   */
  it('does not reset the schedule on a device that has never reviewed it', async () => {
    await send(event({ type: 'completed' }));
    await send(event({ type: 'reviewed', confidence: 'easy' }));
    const remote = await pull();

    const deviceB = [
      {
        seedId: SEED,
        revision: 1,
        blockIndex: 0,
        status: 'in_progress' as const,
        updatedAt: '2026-09-01T00:00:00.000Z',
        reviewCount: 0,
      },
    ];

    const merged = mergeReviews(mergeProgressLists(deviceB, remote.progress), remote.reviews);

    expect(merged[0]).toMatchObject({
      status: 'completed',
      reviewInterval: 14,
      reviewCount: 1,
    });
  });
});

describe('bookmarks, including the ones taken away', () => {
  const saved = (seedId: string, value: boolean, updatedAt: string) => ({
    seedId,
    saved: value,
    updatedAt,
  });

  it('an un-save on one device removes the bookmark on the other', async () => {
    await db.doc(`users/${UID}/saved/${SEED}`).set(saved(SEED, false, '2026-09-05T12:00:00.000Z'));
    const remote = await pull();

    const deviceB = [saved(SEED, true, '2026-09-04T12:00:00.000Z')];
    expect(savedSeedIds(mergeSaved(deviceB, remote.saved))).toEqual([]);
  });

  it('a save the account has not heard about survives the merge', async () => {
    const remote = await pull();
    const deviceB = [saved('seed-sleep-and-memory', true, '2026-09-05T12:00:00.000Z')];

    expect(savedSeedIds(mergeSaved(deviceB, remote.saved))).toEqual(['seed-sleep-and-memory']);
  });
});

describe('completion, across two devices', () => {
  it('stays completed and is counted once, however many times it arrives', async () => {
    const completion = event({ type: 'completed', blockIndex: 9 });

    await send(completion);
    await send(completion);
    // A different event id for the same fact — a second device announcing what
    // it already knew.
    await send(event({ type: 'completed', blockIndex: 9 }));

    const { progress } = await pull();
    expect(progress[0]).toMatchObject({ status: 'completed', percent: 100 });

    const stats = await db.doc(`userStats/${UID}`).get();
    // Two distinct event ids, but the seed is counted once: the aggregate is
    // guarded on the seed already being complete, not on the event id alone.
    expect(stats.data()?.seedsCompleted).toBe(1);
  });

  it('never returns to in_progress after a later partial event', async () => {
    await send(event({ type: 'completed', blockIndex: 9 }));
    await send(event({ type: 'block_viewed', blockIndex: 3 }));

    expect((await pull()).progress[0].status).toBe('completed');
  });
});
