import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { ingestProgressEvents, localDate } from '../../functions/src/progress/ingest';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * Progress ingestion against the emulator.
 *
 * The outbox retries. Everything here is about what happens when the same
 * event arrives twice, out of order, or claiming to be someone else.
 */

let app: App;
let db: Firestore;
let deps: Deps;

const UID = 'reader-ingest';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: `event-${Math.random().toString(36).slice(2, 12)}`,
    uid: UID,
    seedId: 'seed-sky-darkness',
    revision: 4,
    type: 'completed',
    occurredAtDevice: '2026-09-03T20:30:00.000Z',
    timezone: 'Asia/Tehran',
    appVersion: '1.0.0',
    ...overrides,
  };
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'ingest-test');
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
    now: () => new Date('2026-09-03T21:00:00.000Z'),
  };
});

afterAll(async () => {
  // The admin Firestore keeps a gRPC channel that `deleteApp` does not
  // close, which leaves the process alive after the run finishes.
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection('users').doc(UID));
  await db.collection('userStats').doc(UID).delete();
});

describe('idempotency', () => {
  it('applies an event once, however many times it arrives', async () => {
    const completion = event();

    const first = await ingestProgressEvents(deps, { uid: UID, events: [completion] });
    const second = await ingestProgressEvents(deps, { uid: UID, events: [completion] });

    expect(first).toMatchObject({ applied: 1, duplicates: 0 });
    expect(second).toMatchObject({ applied: 0, duplicates: 1 });

    // The whole point: a retried outbox must not inflate the count.
    const stats = await db.collection('userStats').doc(UID).get();
    expect(stats.data()?.seedsCompleted).toBe(1);
  });

  it('deduplicates within a single batch too', async () => {
    const completion = event();
    const result = await ingestProgressEvents(deps, {
      uid: UID,
      events: [completion, completion, completion],
    });

    expect(result).toMatchObject({ applied: 1, duplicates: 2 });
  });
});

describe('authority', () => {
  it('drops an event claiming another reader\'s uid', async () => {
    const result = await ingestProgressEvents(deps, {
      uid: UID,
      events: [event({ uid: 'someone-else' })],
    });

    expect(result.applied).toBe(0);
    expect(result.rejected[0]).toMatchObject({ reason: 'uid-mismatch' });
  });

  it('rejects a malformed event without losing the rest of the batch', async () => {
    const result = await ingestProgressEvents(deps, {
      uid: UID,
      events: [{ id: 'short' }, event()],
    });

    expect(result.applied).toBe(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('progress state', () => {
  it('records a completion as complete', async () => {
    await ingestProgressEvents(deps, { uid: UID, events: [event()] });

    const progress = await db
      .collection('users')
      .doc(UID)
      .collection('progress')
      .doc('seed-sky-darkness')
      .get();

    expect(progress.data()).toMatchObject({ status: 'completed', percent: 100, revision: 4 });
    expect(progress.data()?.completedAt).toBe('2026-09-03T20:30:00.000Z');
  });

  // Streaks and review schedules hang off completion; it only moves one way.
  it('does not reopen a completed seed with a later block event', async () => {
    await ingestProgressEvents(deps, { uid: UID, events: [event()] });
    await ingestProgressEvents(deps, {
      uid: UID,
      events: [event({ type: 'block_viewed', blockId: 'b2' })],
    });

    const progress = await db
      .collection('users')
      .doc(UID)
      .collection('progress')
      .doc('seed-sky-darkness')
      .get();

    expect(progress.data()?.status).toBe('completed');
    expect(progress.data()?.percent).toBe(100);
  });

  it('counts a second seed separately', async () => {
    await ingestProgressEvents(deps, {
      uid: UID,
      events: [event(), event({ seedId: 'lesson-0-0-0', revision: 1 })],
    });

    const stats = await db.collection('userStats').doc(UID).get();
    expect(stats.data()?.seedsCompleted).toBe(2);
  });
});

describe('the reader\'s own day', () => {
  it('buckets a late-evening completion into their local date, not UTC', () => {
    // 20:30 UTC is already the next day in Tehran.
    expect(localDate('2026-09-03T20:30:00.000Z', 'Asia/Tehran')).toBe('2026-09-04');
    expect(localDate('2026-09-03T20:30:00.000Z', 'UTC')).toBe('2026-09-03');
  });

  it('falls back to the UTC date rather than dropping an unknown timezone', () => {
    expect(localDate('2026-09-03T20:30:00.000Z', 'Not/AZone')).toBe('2026-09-03');
  });

  it('writes the daily aggregate under that local date', async () => {
    await ingestProgressEvents(deps, { uid: UID, events: [event()] });

    const daily = await db
      .collection('users')
      .doc(UID)
      .collection('daily')
      .doc('2026-09-04')
      .get();

    expect(daily.data()?.seedsCompleted).toBe(1);
  });
});

describe('reviews', () => {
  it('counts a review pass', async () => {
    await ingestProgressEvents(deps, {
      uid: UID,
      events: [event({ type: 'reviewed', confidence: 'good' })],
    });

    const stats = await db.collection('userStats').doc(UID).get();
    expect(stats.data()?.reviewsCompleted).toBe(1);
  });
});
