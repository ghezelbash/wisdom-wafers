import type { SavedDoc } from '@dananeh/content-schema';

import {
  mergePreferences,
  mergeProgressLists,
  mergeReviews,
  mergeSaved,
  savedSeedIds,
  type AccountPreferences,
  type SyncableProgress,
} from '@/domain/account/sync';
import { restoreAccount } from '@/domain/account/restore';

/**
 * Two devices, one account.
 *
 * The policy has to be deterministic — the same two states must always produce
 * the same third, whichever device ran the merge — and it has to be asymmetric,
 * because losing a completion costs a reader something they earned while
 * double-counting a block view costs nothing.
 */

const progress = (overrides: Partial<SyncableProgress> = {}): SyncableProgress => ({
  seedId: 'seed-1',
  revision: 3,
  blockIndex: 2,
  status: 'in_progress',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

describe('merging progress across devices', () => {
  it('keeps a seed only one side knows about', () => {
    const merged = mergeProgressLists(
      [progress({ seedId: 'only-local' })],
      [progress({ seedId: 'only-remote' })]
    );

    expect(merged.map((item) => item.seedId)).toEqual(['only-local', 'only-remote']);
  });

  it('never un-completes a seed', () => {
    const merged = mergeProgressLists(
      [progress({ status: 'completed', completedAt: '2026-09-01T09:00:00.000Z' })],
      [progress({ status: 'in_progress', updatedAt: '2026-09-02T10:00:00.000Z' })]
    );

    expect(merged[0].status).toBe('completed');
    expect(merged[0].completedAt).toBe('2026-09-01T09:00:00.000Z');
  });

  it('takes the furthest position within a revision', () => {
    const merged = mergeProgressLists(
      [progress({ blockIndex: 7 })],
      [progress({ blockIndex: 2, updatedAt: '2026-09-05T10:00:00.000Z' })]
    );

    expect(merged[0].blockIndex).toBe(7);
  });

  it('lets a newer revision win outright — the block lists differ', () => {
    const merged = mergeProgressLists(
      [progress({ revision: 3, blockIndex: 9 })],
      [progress({ revision: 4, blockIndex: 1 })]
    );

    expect(merged[0]).toMatchObject({ revision: 4, blockIndex: 1 });
  });

  it('takes review state from whichever side is newer, not the larger interval', () => {
    const merged = mergeProgressLists(
      [progress({ reviewedAt: '2026-09-01T10:00:00.000Z', reviewInterval: 14, reviewCount: 1 })],
      [
        progress({
          updatedAt: '2026-09-03T10:00:00.000Z',
          reviewedAt: '2026-09-03T10:00:00.000Z',
          reviewInterval: 3,
          reviewCount: 2,
        }),
      ]
    );

    // The interval belongs to the attempt that produced it; taking the maximum
    // would invent a schedule neither device ever computed.
    expect(merged[0].reviewInterval).toBe(3);
    expect(merged[0].reviewCount).toBe(2);
  });

  it('is deterministic whichever device runs it', () => {
    const a = [progress({ blockIndex: 7, updatedAt: '2026-09-01T10:00:00.000Z' })];
    const b = [progress({ blockIndex: 2, updatedAt: '2026-09-02T10:00:00.000Z' })];

    expect(mergeProgressLists(a, b)).toEqual(mergeProgressLists(a, b));
    expect(mergeProgressLists(a, b)[0].blockIndex).toBe(mergeProgressLists(b, a)[0].blockIndex);
  });
});

describe('merging bookmarks', () => {
  const at = (seedId: string, saved: boolean, updatedAt: string) => ({ seedId, saved, updatedAt });

  it('takes the newest statement about each seed', () => {
    const merged = mergeSaved(
      [at('a', true, '2026-09-01T10:00:00.000Z'), at('b', true, '2026-09-03T10:00:00.000Z')],
      [at('a', false, '2026-09-02T10:00:00.000Z')]
    );

    expect(savedSeedIds(merged)).toEqual(['b']);
  });

  /**
   * The reason a removal is a document rather than an absence: an un-save has
   * to be able to travel, and a deleted row says nothing to a device that never
   * saw it exist.
   */
  it('lets an un-save reach a device that still has the bookmark', () => {
    const merged = mergeSaved(
      [at('a', true, '2026-09-01T10:00:00.000Z')],
      [at('a', false, '2026-09-02T10:00:00.000Z')]
    );

    expect(savedSeedIds(merged)).toEqual([]);
  });

  /**
   * Per seed, not per set. Taking whole sets by timestamp would let a device
   * that bookmarked something an hour ago undo an un-save from a minute ago.
   */
  it('does not let a newer change to one seed undo an older change to another', () => {
    const merged = mergeSaved(
      [at('a', true, '2026-09-05T10:00:00.000Z')],
      [at('b', true, '2026-09-01T10:00:00.000Z')]
    );

    expect(savedSeedIds(merged)).toEqual(['a', 'b']);
  });

  it('is deterministic whichever device runs it', () => {
    const one = [at('a', true, '2026-09-01T10:00:00.000Z')];
    const two = [at('a', false, '2026-09-02T10:00:00.000Z')];

    expect(mergeSaved(one, two)).toEqual(mergeSaved(two, one));
  });
});

describe('restoring the review schedule', () => {
  const item = (overrides = {}) => ({ ...progress(), reviewCount: 0, ...overrides });

  it('takes the account schedule when it is newer', () => {
    const [merged] = mergeReviews(
      [item({ reviewedAt: '2026-09-01T10:00:00.000Z', reviewInterval: 3, reviewCount: 1 })],
      [{ seedId: 'seed-1', reviewedAt: '2026-09-04T10:00:00.000Z', interval: 14, count: 2 }]
    );

    expect(merged.reviewedAt).toBe('2026-09-04T10:00:00.000Z');
    expect(merged.reviewInterval).toBe(14);
  });

  it('keeps the schedule on this device when it is the newer one', () => {
    const [merged] = mergeReviews(
      [item({ reviewedAt: '2026-09-06T10:00:00.000Z', reviewInterval: 7, reviewCount: 3 })],
      [{ seedId: 'seed-1', reviewedAt: '2026-09-04T10:00:00.000Z', interval: 14, count: 2 }]
    );

    expect(merged.reviewInterval).toBe(7);
  });

  /** Every review happened, on whichever device. */
  it('takes the larger count either way', () => {
    const [merged] = mergeReviews(
      [item({ reviewedAt: '2026-09-06T10:00:00.000Z', reviewCount: 5 })],
      [{ seedId: 'seed-1', reviewedAt: '2026-09-04T10:00:00.000Z', interval: 14, count: 9 }]
    );

    expect(merged.reviewCount).toBe(9);
  });

  // Signing in on a second device must not put a seed back in the queue.
  it('does not reset a schedule for a seed the account has never reviewed', () => {
    const [merged] = mergeReviews(
      [item({ reviewedAt: '2026-09-06T10:00:00.000Z', reviewInterval: 7, reviewCount: 3 })],
      []
    );

    expect(merged).toMatchObject({ reviewInterval: 7, reviewCount: 3 });
  });
});

describe('merging preferences', () => {
  const prefs = (updatedAt: string, pace: string): AccountPreferences => ({
    locale: 'fa-IR',
    timezone: 'Asia/Tehran',
    interests: ['psychology'],
    notificationPreferences: { pace, timeOfDay: 'evening', reminderTime: '21:00', enabled: true },
    updatedAt,
  });

  it('takes the newer set whole, rather than mixing two', () => {
    const merged = mergePreferences(
      prefs('2026-09-01T10:00:00.000Z', 'one'),
      prefs('2026-09-02T10:00:00.000Z', 'two')
    );

    expect(merged?.notificationPreferences.pace).toBe('two');
  });

  it('falls back to whichever side exists', () => {
    const only = prefs('2026-09-01T10:00:00.000Z', 'one');
    expect(mergePreferences(null, only)).toBe(only);
    expect(mergePreferences(only, null)).toBe(only);
    expect(mergePreferences(null, null)).toBeNull();
  });
});

describe('restoring an account onto a device', () => {
  it('brings back what the account knows without erasing what the device does', async () => {
    const written: SyncableProgress[] = [];
    let saved: string[] = [];

    const result = await restoreAccount('account-1', {
      pull: async () => ({
        preferences: null,
        progress: [progress({ seedId: 'from-account', status: 'completed' })],
        saved: [
          { seedId: 'from-account', saved: true, updatedAt: '2026-09-02T10:00:00.000Z' },
        ],
        reviews: [
          {
            seedId: 'from-account',
            reviewedAt: '2026-09-03T10:00:00.000Z',
            interval: 14,
            count: 2,
          },
        ],
      }),
      // A completion made on a plane, still queued and unknown to the account.
      readLocal: async () => [progress({ seedId: 'on-device', status: 'completed' })],
      readLocalSaved: async () => [
        { seedId: 'on-device', saved: true, updatedAt: '2026-09-01T10:00:00.000Z' },
      ],
      writeLocal: async (items) => {
        written.push(...items);
      },
      applySaved: async (ids) => {
        saved = ids;
      },
      readLocalPreferences: async () => null,
      applyPreferences: async () => {},
    });

    expect(written.map((item) => item.seedId).sort()).toEqual(['from-account', 'on-device']);
    expect(result).toMatchObject({ merged: 2, gained: 1, saved: 2, reviewsRestored: 1 });
    // Both sides' bookmarks survive; neither device's is dropped.
    expect(saved).toEqual(['from-account', 'on-device']);

    // The account's review schedule came down with it.
    const restored = written.find((item) => item.seedId === 'from-account');
    expect(restored).toMatchObject({ reviewInterval: 14, reviewCount: 2 });
  });

  /** What the account had not heard yet goes back up. */
  it('sends newer bookmark statements from this device to the account', async () => {
    const pushed: SavedDoc[] = [];

    await restoreAccount('account-1', {
      pull: async () => ({
        preferences: null,
        progress: [],
        saved: [{ seedId: 'a', saved: true, updatedAt: '2026-09-01T10:00:00.000Z' }],
        reviews: [],
      }),
      readLocal: async () => [],
      readLocalSaved: async () => [
        // Un-saved here, more recently than the account knows.
        { seedId: 'a', saved: false, updatedAt: '2026-09-04T10:00:00.000Z' },
        { seedId: 'b', saved: true, updatedAt: '2026-09-04T10:00:00.000Z' },
      ],
      readLocalPreferences: async () => null,
      applyPreferences: async () => {},
      writeLocal: async () => {},
      applySaved: async () => {},
      pushSaved: async (entries) => {
        pushed.push(...entries);
      },
    });

    expect(pushed.map((entry) => entry.seedId).sort()).toEqual(['a', 'b']);
    expect(pushed.find((entry) => entry.seedId === 'a')?.saved).toBe(false);
  });
});

/**
 * The half that did not exist.
 *
 * `AccountSync.pull` returned the account's preferences and `mergePreferences`
 * knew what to do with them — and **nothing called either**. Signing in on a
 * second phone restored the garden and then showed the default pace, no
 * interests and no reminder. Every one of these would have passed before the
 * ports existed, which is exactly why they are written against the ports.
 */
describe('preferences, on a device that has just signed in', () => {
  const prefs = (updatedAt: string, pace: string): AccountPreferences => ({
    locale: 'fa-IR',
    timezone: 'Asia/Tehran',
    interests: ['psychology'],
    notificationPreferences: { pace, timeOfDay: 'evening', reminderTime: '21:00', enabled: true },
    updatedAt,
  });

  const remotePrefs = prefs('2026-09-05T12:00:00.000Z', 'two');
  const localPrefs = prefs('2026-09-01T12:00:00.000Z', 'one');

  const emptyAccount = (preferences: AccountPreferences | null) => ({
    preferences,
    progress: [],
    saved: [],
    reviews: [],
  });

  const run = async (
    remote: AccountPreferences | null,
    local: AccountPreferences | null,
    applied: AccountPreferences[] = [],
    pushed: AccountPreferences[] = []
  ) => ({
    result: await restoreAccount('account-1', {
      pull: async () => emptyAccount(remote),
      readLocal: async () => [],
      readLocalSaved: async () => [],
      writeLocal: async () => {},
      applySaved: async () => {},
      readLocalPreferences: async () => local,
      applyPreferences: async (value) => {
        applied.push(value);
      },
      pushPreferences: async (value) => {
        pushed.push(value);
      },
    }),
    applied,
    pushed,
  });

  it('applies the account\u2019s settings to a device that has none', async () => {
    const { result, applied } = await run(remotePrefs, null);

    expect(result.preferences).toBe('remote');
    expect(applied).toEqual([remotePrefs]);
  });

  it('applies the newer of the two, by timestamp', async () => {
    const { result, applied } = await run(remotePrefs, localPrefs);

    expect(result.preferences).toBe('remote');
    expect(applied[0].notificationPreferences.pace).toBe('two');
  });

  /** The device decided more recently, so the account has not heard it. */
  it('keeps this device\u2019s settings when they are newer, and sends them up', async () => {
    const newerLocal = prefs('2026-09-06T12:00:00.000Z', 'whenever');
    const { result, applied, pushed } = await run(remotePrefs, newerLocal);

    expect(result.preferences).toBe('local');
    expect(applied).toEqual([newerLocal]);
    expect(pushed).toEqual([newerLocal]);
  });

  it('sends nothing up when the account already had the newer copy', async () => {
    const { pushed } = await run(remotePrefs, localPrefs);
    expect(pushed).toEqual([]);
  });

  it('does nothing at all when neither side has any', async () => {
    const { result, applied, pushed } = await run(null, null);

    expect(result.preferences).toBe('none');
    expect(applied).toEqual([]);
    expect(pushed).toEqual([]);
  });

  /**
   * The regression this exists to catch: a restore that ignores the remote
   * copy still returns a perfectly healthy-looking result for progress.
   */
  it('would fail if the remote preferences were ignored', async () => {
    const { applied } = await run(remotePrefs, null);
    expect(applied).toHaveLength(1);
  });
});
