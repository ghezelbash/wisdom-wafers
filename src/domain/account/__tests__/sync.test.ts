import {
  mergePreferences,
  mergeProgressLists,
  mergeSaved,
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
  // The union is wrong: un-saving on one device would never stick.
  it('lets the newer side decide the whole set', () => {
    expect(
      mergeSaved(
        { saved: ['a', 'b'], updatedAt: '2026-09-01T10:00:00.000Z' },
        { saved: ['a'], updatedAt: '2026-09-02T10:00:00.000Z' }
      )
    ).toEqual(['a']);
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
        saved: ['from-account'],
        reviews: [],
      }),
      // A completion made on a plane, still queued and unknown to the account.
      readLocal: async () => [progress({ seedId: 'on-device', status: 'completed' })],
      writeLocal: async (items) => {
        written.push(...items);
      },
      applySaved: async (ids) => {
        saved = ids;
      },
    });

    expect(written.map((item) => item.seedId).sort()).toEqual(['from-account', 'on-device']);
    expect(result).toMatchObject({ merged: 2, gained: 1, saved: 1 });
    expect(saved).toEqual(['from-account']);
  });
});
