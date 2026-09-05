import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { recordTelemetry } from '../../functions/src/telemetry/record';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * The funnel and the crash trail, against the real backend.
 *
 * Two things have to hold. The events that make the onboarding → start →
 * completion funnel readable must actually land. And nothing personal may reach
 * the collection — the client refuses an unsafe event before queueing it, and
 * this refuses it again, because a client is not a trust boundary: an old build
 * still in the field can send whatever it likes.
 */

const UID = 'reader-telemetry';
const NOW = new Date('2026-09-04T12:00:00.000Z');

let app: App;
let db: Firestore;
let deps: Deps;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'telemetry-test');
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
  // The admin Firestore keeps a gRPC channel that `deleteApp` does not
  // close, which leaves the process alive after the run finishes.
  await db.terminate();
  await deleteApp(app);
});

beforeEach(async () => {
  for (const name of ['telemetryEvents', 'crashReports']) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

const event = (id: string, name: string, params: Record<string, unknown> = {}) => ({
  id,
  name,
  params,
  occurredAt: '2026-09-04T11:00:00.000Z',
  appVersion: '1.0.0',
  appVariant: 'staging',
});

describe('the funnel', () => {
  it('records onboarding → seed start → completion', async () => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      events: [
        event('evt-00001', 'onboarding_completed', { topic_count: 2, pace: 'one', duration_ms: 42000 }),
        event('evt-00002', 'seed_started', {
          seed_id: 'seed-anchoring',
          revision: 1,
          source: 'home_hero',
          online: true,
        }),
        event('evt-00003', 'seed_completed', {
          seed_id: 'seed-anchoring',
          duration_ms: 310000,
          interaction_count: 6,
        }),
      ],
    });

    expect(result).toMatchObject({ applied: 3, duplicates: 0, rejected: [] });

    const stored = await db.collection('telemetryEvents').get();
    expect(stored.docs.map((d) => d.data().name).sort()).toEqual([
      'onboarding_completed',
      'seed_completed',
      'seed_started',
    ]);
    // The uid comes from the caller, never from the payload.
    for (const document of stored.docs) expect(document.data().uid).toBe(UID);
  });

  it('counts a retried event once', async () => {
    await recordTelemetry(deps, { uid: UID, events: [event('evt-00001', 'seed_started')] });
    const again = await recordTelemetry(deps, {
      uid: UID,
      events: [event('evt-00001', 'seed_started')],
    });

    expect(again).toMatchObject({ applied: 0, duplicates: 1 });
    expect((await db.collection('telemetryEvents').get()).size).toBe(1);
  });
});

describe('nothing personal gets through', () => {
  it.each([
    ['a search term', { query: 'پارادوکس اولبرس' }],
    ['an email address', { email: 'reader@example.com' }],
    ['a reflection', { reflection: 'چیزی که نوشتم' }],
    ['a seed title', { title: 'چرا آسمان شب تاریک است؟' }],
    ['a token', { token: 'eyJhbGciOi' }],
    ['a phone number', { phone: '09120000000' }],
  ])('refuses %s', async (_label, params) => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      events: [event('evt-00009', 'search_performed', params)],
    });

    expect(result.applied).toBe(0);
    expect(result.rejected[0].reason).toMatch(/^unsafe-key:/);
    expect((await db.collection('telemetryEvents').get()).size).toBe(0);
  });

  it('accepts the shape a search is allowed to be — a length and a count', async () => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      events: [
        event('evt-00010', 'search_performed', {
          normalized_length: 12,
          result_count: 3,
          filter_count: 0,
        }),
      ],
    });

    expect(result.applied).toBe(1);
  });

  it('refuses a value long enough to be content rather than a label', async () => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      events: [event('evt-00011', 'seed_started', { source: 'x'.repeat(200) })],
    });

    expect(result.applied).toBe(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('refuses a non-scalar parameter, which could carry anything', async () => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      events: [event('evt-00012', 'seed_started', { nested: { anything: 'here' } })],
    });

    expect(result.applied).toBe(0);
  });
});

describe('crash reports', () => {
  const crash = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    message: 'TypeError: undefined is not an object',
    context: { route: '/seed', seed_id: 'seed-anchoring', revision: 1 },
    stack: 'at BlockRenderer\nat SeedPlayerScreen',
    fatal: true,
    occurredAt: '2026-09-04T11:00:00.000Z',
    appVersion: '1.0.0',
    appVariant: 'staging',
    ...overrides,
  });

  it('lands with the route, seed and revision that reproduce it', async () => {
    const result = await recordTelemetry(deps, { uid: UID, crashes: [crash('crash-0001')] });
    expect(result.applied).toBe(1);

    const stored = await db.doc('crashReports/crash-0001').get();
    expect(stored.data()).toMatchObject({
      fatal: true,
      appVersion: '1.0.0',
      uid: UID,
      receivedAt: NOW.toISOString(),
    });
    expect(stored.data()?.context).toMatchObject({ route: '/seed', seed_id: 'seed-anchoring' });
  });

  it('refuses a context carrying something personal', async () => {
    const result = await recordTelemetry(deps, {
      uid: UID,
      crashes: [crash('crash-0002', { context: { route: '/auth', email: 'a@b.com' } })],
    });

    expect(result.applied).toBe(0);
    expect(result.rejected[0].reason).toContain('unsafe-key');
  });

  it('counts a retried crash once, so one bug is not two', async () => {
    await recordTelemetry(deps, { uid: UID, crashes: [crash('crash-0003')] });
    const again = await recordTelemetry(deps, { uid: UID, crashes: [crash('crash-0003')] });

    expect(again).toMatchObject({ applied: 0, duplicates: 1 });
  });
});
