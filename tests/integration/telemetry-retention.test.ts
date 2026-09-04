import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { recordTelemetry } from '../../functions/src/telemetry/record';
import {
  buildOpsDigest,
  cutoffFor,
  sweepExpired,
  writeOpsDigest,
  RETENTION_DAYS,
} from '../../functions/src/telemetry/retention';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * The two things that have to be true while Firestore *is* the crash trail.
 *
 * Crashlytics needs native modules and is not here yet, so `crashReports` and
 * `telemetryEvents` are what a staging APK reports into. That only works if the
 * data expires on its own, and if a day can be read as a number rather than as
 * a thousand documents.
 */

const UID = 'retention-reader';
let app: App;
let db: Firestore;
let clock: Date;
let deps: Deps;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'telemetry-retention');
  db = getFirestore(app);
});

afterAll(async () => {
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00.000Z');
  deps = {
    db,
    async putObject(path) {
      return path;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => clock,
  };

  for (const name of ['telemetryEvents', 'crashReports', 'opsDigest']) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

let sequence = 0;
const id = (prefix: string) => `${prefix}-${(sequence += 1).toString().padStart(4, '0')}`;

const crash = (overrides: Record<string, unknown> = {}) => ({
  id: id('crash'),
  message: 'TypeError: cannot read property of undefined',
  context: { route: '/seed', session_id: 'session-a' },
  fatal: false,
  occurredAt: '2026-09-04T09:00:00.000Z',
  appVersion: '1.0.0',
  appVariant: 'staging',
  ...overrides,
});

const event = (overrides: Record<string, unknown> = {}) => ({
  id: id('event'),
  name: 'seed_started',
  params: { seed_id: 'seed-anchoring' },
  occurredAt: '2026-09-04T09:00:00.000Z',
  appVersion: '1.0.0',
  appVariant: 'staging',
  ...overrides,
});

const send = (payload: { events?: unknown[]; crashes?: unknown[] }) =>
  recordTelemetry(deps, { uid: UID, ...payload });

describe('telemetry expires on its own', () => {
  it('keeps crashes longer than events, because they are read later', () => {
    expect(RETENTION_DAYS.crashReports).toBeGreaterThan(RETENTION_DAYS.telemetryEvents);
    expect(cutoffFor('telemetryEvents', clock)).toBe('2026-08-06T12:00:00.000Z');
  });

  it('deletes what is past its window and keeps what is not', async () => {
    // Received long ago…
    clock = new Date('2026-06-01T12:00:00.000Z');
    await send({ events: [event()] });

    // …and received today.
    clock = new Date('2026-09-05T12:00:00.000Z');
    await send({ events: [event()] });

    const swept = await sweepExpired(deps, { collection: 'telemetryEvents' });

    expect(swept.deleted).toBe(1);
    expect((await db.collection('telemetryEvents').get()).size).toBe(1);
  });

  /**
   * A sweep that tries to delete a year of backlog at once times out and
   * deletes nothing, so it is bounded and says whether to come back.
   */
  it('sweeps in bounded batches and reports that more is left', async () => {
    clock = new Date('2026-06-01T12:00:00.000Z');
    await send({ events: Array.from({ length: 5 }, () => event()) });
    clock = new Date('2026-09-05T12:00:00.000Z');

    const first = await sweepExpired(deps, { collection: 'telemetryEvents', limit: 2 });
    expect(first).toEqual({ deleted: 2, remaining: true });

    const second = await sweepExpired(deps, { collection: 'telemetryEvents', limit: 2 });
    expect(second).toEqual({ deleted: 2, remaining: true });

    const third = await sweepExpired(deps, { collection: 'telemetryEvents', limit: 2 });
    expect(third).toEqual({ deleted: 1, remaining: false });
  });

  it('reports nothing to do on a clean collection', async () => {
    await expect(sweepExpired(deps, { collection: 'crashReports' })).resolves.toEqual({
      deleted: 0,
      remaining: false,
    });
  });
});

describe('a day, as one document', () => {
  it('counts crashes, fatals and the sessions behind them', async () => {
    await send({
      crashes: [
        crash(),
        crash(),
        crash({ fatal: true, context: { route: '/garden', session_id: 'session-b' } }),
      ],
    });

    const digest = await buildOpsDigest(deps, '2026-09-04');

    expect(digest).toMatchObject({ crashes: 3, fatalCrashes: 1 });
    // One reader hitting a bug thirty times is a different decision from thirty
    // readers hitting it once, so the sessions are counted separately.
    expect(digest.affectedSessions).toBe(2);
  });

  it('names the messages that happened most', async () => {
    await send({
      crashes: [crash(), crash(), crash({ message: 'Error: network request failed' })],
    });

    const digest = await buildOpsDigest(deps, '2026-09-04');
    expect(digest.topMessages[0]).toEqual({
      message: 'TypeError: cannot read property of undefined',
      count: 2,
    });
  });

  it('counts the funnel, so a collapse is visible without a query', async () => {
    await send({
      events: [event(), event(), event({ name: 'seed_completed', params: { duration_ms: 1 } })],
    });

    const digest = await buildOpsDigest(deps, '2026-09-04');
    expect(digest.eventCounts).toEqual({ seed_started: 2, seed_completed: 1 });
  });

  it('names the builds that crashed', async () => {
    await send({
      crashes: [crash(), crash({ appVersion: '1.0.1' })],
    });

    const digest = await buildOpsDigest(deps, '2026-09-04');
    expect(digest.builds).toEqual({ 'staging@1.0.0': 1, 'staging@1.0.1': 1 });
  });

  /**
   * The failure this prevents: a crash that happened offline on the day a
   * release went wrong, delivered two days later, would make the bad day look
   * quiet and a good day look catastrophic.
   */
  it('files a late arrival under the day it happened, not the day it arrived', async () => {
    clock = new Date('2026-09-06T12:00:00.000Z');
    await send({ crashes: [crash({ occurredAt: '2026-09-04T23:30:00.000Z' })] });

    expect((await buildOpsDigest(deps, '2026-09-04')).crashes).toBe(1);
    expect((await buildOpsDigest(deps, '2026-09-06')).crashes).toBe(0);
  });

  it('reports a quiet day as zeroes rather than as nothing', async () => {
    const digest = await buildOpsDigest(deps, '2026-09-04');

    expect(digest).toMatchObject({ crashes: 0, events: 0, affectedSessions: 0 });
    expect(digest.topMessages).toEqual([]);
  });

  it('writes where an operator can read it, and can be run again', async () => {
    await send({ crashes: [crash()] });

    await writeOpsDigest(deps, '2026-09-04');
    const second = await writeOpsDigest(deps, '2026-09-04');

    const stored = await db.doc('opsDigest/2026-09-04').get();
    expect(stored.data()).toMatchObject({ crashes: 1 });
    expect(second.crashes).toBe(1);
  });
});
