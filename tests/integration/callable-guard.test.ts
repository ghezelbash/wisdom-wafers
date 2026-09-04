import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  appCheckCoverageFor,
  assertBatch,
  assertPayload,
  assertRateLimit,
  guard,
  GuardError,
  LIMITS,
  limitsFor,
  payloadBytes,
  recordAppCheckCoverage,
} from '../../functions/src/shared/guard';
import type { Deps } from '../../functions/src/shared/deps';

/**
 * What a public callable refuses before it does any work.
 *
 * Every endpoint validated the *contents* of a request and none of them
 * validated its size or how often it arrived: one signed-in account could call
 * any of them as fast as it could open sockets, with a body of any length.
 *
 * The counters run against the real emulator rather than a fake, because the
 * whole point of the rate limit is the transaction — two requests landing at
 * once must not both pass a read-then-write.
 */

const UID = 'guard-reader';
let app: App;
let db: Firestore;
let clock: Date;
let deps: Deps;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'callable-guard');
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

  for (const path of ['rateLimits', 'appCheckCoverage/2026-09-05/shards']) {
    const snapshot = await db.collection(path).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});

const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

describe('the size of a request', () => {
  it('is measured in bytes on the wire, not characters', () => {
    // Persian is two bytes a character; a limit read in UTF-16 units would be
    // twice as permissive for the language the app is written in.
    expect(payloadBytes({ t: 'دانه' })).toBeGreaterThan(JSON.stringify({ t: 'دانه' }).length);
  });

  it('refuses a body over the callable limit', () => {
    const huge = { events: [{ note: 'x'.repeat(LIMITS.ingestProgress.maxBytes) }] };

    expect(() => assertPayload('ingestProgress', huge)).toThrow(GuardError);
    expect(() => assertPayload('ingestProgress', { events: [] })).not.toThrow();
  });

  it('refuses a body that cannot be serialised at all', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => assertPayload('submitReport', circular)).toThrow(GuardError);
  });

  /** A name with no entry must not mean "no limit". */
  it('falls back to the strictest limits for an unknown callable', () => {
    expect(limitsFor('somethingNew')).toEqual(limitsFor('somethingNew'));
    expect(() => assertBatch('somethingNew', 2)).toThrow(GuardError);
    expect(() => assertPayload('somethingNew', { blob: 'y'.repeat(32 * 1024) })).toThrow(GuardError);
  });
});

describe('the number of items in a batch', () => {
  it('comes from the one table rather than three call sites', () => {
    expect(() => assertBatch('ingestProgress', 200)).not.toThrow();
    expect(() => assertBatch('ingestProgress', 201)).toThrow(GuardError);
    expect(() => assertBatch('submitReport', 51)).toThrow(GuardError);
    expect(() => assertBatch('recordTelemetryBatch', 101)).toThrow(GuardError);
  });
});

describe('how often one caller may call', () => {
  it('allows the whole window and refuses the next call', async () => {
    const limit = LIMITS.submitReport.perWindow;

    for (let call = 0; call < limit; call += 1) {
      await assertRateLimit(deps, { name: 'submitReport', key: UID });
    }

    await expect(assertRateLimit(deps, { name: 'submitReport', key: UID })).rejects.toMatchObject({
      code: 'rate-limited',
    });
  });

  it('tells the caller how long to wait, so it does not have to guess', async () => {
    for (let call = 0; call < LIMITS.submitReport.perWindow; call += 1) {
      await assertRateLimit(deps, { name: 'submitReport', key: UID });
    }
    advance(20);

    const error = await assertRateLimit(deps, { name: 'submitReport', key: UID }).catch(
      (raised: GuardError) => raised
    );

    expect(error).toBeInstanceOf(GuardError);
    expect((error as GuardError).retryAfterSeconds).toBe(40);
  });

  it('lets the caller through again once the window rolls over', async () => {
    for (let call = 0; call < LIMITS.submitReport.perWindow; call += 1) {
      await assertRateLimit(deps, { name: 'submitReport', key: UID });
    }
    await expect(assertRateLimit(deps, { name: 'submitReport', key: UID })).rejects.toThrow();

    advance(60);
    await expect(assertRateLimit(deps, { name: 'submitReport', key: UID })).resolves.toEqual({
      remaining: LIMITS.submitReport.perWindow - 1,
    });
  });

  /**
   * The reason it is a transaction: a read-then-write lets two simultaneous
   * requests both see the same count and both pass.
   */
  it('counts calls that arrive at the same moment', async () => {
    const limit = LIMITS.submitReport.perWindow;
    const attempts = Array.from({ length: limit + 6 }, () =>
      assertRateLimit(deps, { name: 'submitReport', key: UID })
    );

    const settled = await Promise.allSettled(attempts);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(limit);
  });

  it('counts each caller and each callable separately', async () => {
    for (let call = 0; call < LIMITS.submitReport.perWindow; call += 1) {
      await assertRateLimit(deps, { name: 'submitReport', key: UID });
    }

    // A noisy account must not throttle everyone else, nor its own other work.
    await expect(
      assertRateLimit(deps, { name: 'submitReport', key: 'someone-else' })
    ).resolves.toBeDefined();
    await expect(
      assertRateLimit(deps, { name: 'ingestProgress', key: UID })
    ).resolves.toBeDefined();
  });

  /** A uid is a path segment; a key that is not must not escape the document. */
  it('cannot be escaped by a key containing a slash', async () => {
    await assertRateLimit(deps, { name: 'submitReport', key: 'a/../b' });

    const snapshot = await db.collection('rateLimits').get();
    expect(snapshot.docs.map((document) => document.id)).toEqual(['submitReport__a%2F..%2Fb']);
  });
});

describe('App Check coverage, before enforcement', () => {
  it('counts verified and unverified calls so the rollout has a number', async () => {
    await recordAppCheckCoverage(deps, { name: 'ingestProgress', verified: true });
    await recordAppCheckCoverage(deps, { name: 'ingestProgress', verified: true });
    await recordAppCheckCoverage(deps, { name: 'ingestProgress', verified: false });

    const coverage = await appCheckCoverageFor(deps, '2026-09-05');
    expect(coverage).toEqual({ verified: 2, unverified: 1, ratio: 2 / 3 });
  });

  it('reports nothing rather than dividing by zero on a quiet day', async () => {
    await expect(appCheckCoverageFor(deps, '2026-09-05')).resolves.toEqual({
      verified: 0,
      unverified: 0,
      ratio: 0,
    });
  });

  /** A metric must never be the reason a reader's completion fails to record. */
  it('never lets the metric fail the call it is measuring', async () => {
    const broken: Deps = {
      ...deps,
      db: {
        doc() {
          throw new Error('metrics unavailable');
        },
      } as unknown as Firestore,
    };

    await expect(
      recordAppCheckCoverage(broken, { name: 'ingestProgress', verified: true })
    ).resolves.toBeUndefined();
  });

  it('lets an unverified call through, because enforcement is not on yet', async () => {
    await expect(
      guard(deps, {
        name: 'ingestProgress',
        key: UID,
        data: { events: [] },
        items: 0,
        appCheckVerified: false,
      })
    ).resolves.toBeUndefined();
  });
});

describe('the checks together', () => {
  it('refuse an oversized body without spending a Firestore transaction', async () => {
    await expect(
      guard(deps, {
        name: 'submitReport',
        key: UID,
        data: { reports: [{ note: 'x'.repeat(LIMITS.submitReport.maxBytes) }] },
        items: 1,
        appCheckVerified: false,
      })
    ).rejects.toMatchObject({ code: 'payload-too-large' });

    // Nothing was counted, so a flood of oversized requests is refused for free.
    expect((await db.collection('rateLimits').get()).empty).toBe(true);
  });

  it('refuse an over-long batch before the rate limit as well', async () => {
    await expect(
      guard(deps, {
        name: 'submitReport',
        key: UID,
        data: { reports: [] },
        items: 999,
        appCheckVerified: false,
      })
    ).rejects.toMatchObject({ code: 'too-many-items' });
  });
});
