import { KeyValueOutboxStore, type KeyValue } from '@/data/local/outbox-store';
import { backfillEventId, migrateIdentity, transferQueue } from '@/domain/identity/migration';
import { isLocalUid, LOCAL_UID_PREFIX } from '@/domain/identity/types';
import { recordCompletion } from '@/domain/progress/events';
import { __setOutboxStore, flush, listOutbox } from '@/lib/outbox';
import { clearAllProgress, saveProgress } from '@/lib/progress-store';

/**
 * A reader's uid changes, and nothing they have done may be lost.
 *
 * Three ways it changes — recovering from a device-only identity, upgrading an
 * anonymous session, and signing into an account that already existed — and the
 * queue has to follow them every time. An envelope carries the uid it was built
 * with, and the server refuses one that does not match the caller.
 */

function memoryKeyValue(): KeyValue {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

beforeEach(async () => {
  __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue()));
  await clearAllProgress();
});

afterEach(() => {
  __setOutboxStore(null);
});

describe('recognising a device-only uid', () => {
  it('tells one apart from a Firebase uid', () => {
    expect(isLocalUid(`${LOCAL_UID_PREFIX}abc-123`)).toBe(true);
    expect(isLocalUid('8kJq2mNpQ1XyZ')).toBe(false);
  });
});

describe('handing the queue to a new owner', () => {
  it('rewrites every envelope built under the old uid', async () => {
    await recordCompletion({ uid: 'local-a', seedId: 'seed-1', revision: 2 });
    await recordCompletion({ uid: 'local-a', seedId: 'seed-2', revision: 1 });

    expect(await transferQueue('local-a', 'firebase-1')).toBe(2);

    const items = await listOutbox();
    expect(items.map((item) => item.payload.uid)).toEqual(['firebase-1', 'firebase-1']);
  });

  it('leaves envelopes belonging to someone else alone', async () => {
    await recordCompletion({ uid: 'local-a', seedId: 'seed-1', revision: 2 });
    await recordCompletion({ uid: 'other-uid', seedId: 'seed-2', revision: 1 });

    expect(await transferQueue('local-a', 'firebase-1')).toBe(1);

    const owners = (await listOutbox()).map((item) => item.payload.uid).sort();
    expect(owners).toEqual(['firebase-1', 'other-uid']);
  });

  it('does nothing when the uid has not actually changed', async () => {
    await recordCompletion({ uid: 'firebase-1', seedId: 'seed-1', revision: 2 });
    expect(await transferQueue('firebase-1', 'firebase-1')).toBe(0);
  });

  /**
   * The whole reason this exists: an event queued as a guest, rejected once
   * because it named a uid the caller no longer is, must be delivered after the
   * reader signs in — not left dead for a reason that no longer holds.
   */
  it('revives an envelope that dead-lettered as a uid mismatch', async () => {
    await recordCompletion({ uid: 'local-a', seedId: 'seed-1', revision: 2 });
    await flush(async () => ({ status: 'rejected', reason: 'uid-mismatch' }), true);

    expect((await listOutbox())[0].dead).toBe(true);

    await transferQueue('local-a', 'firebase-1');

    const [revived] = await listOutbox();
    expect(revived.dead).toBe(false);
    expect(revived.attempts).toBe(0);
    expect(revived.payload.uid).toBe('firebase-1');

    // And it now goes through.
    expect(await flush(async () => ({ status: 'applied' }), true)).toMatchObject({ sent: 1 });
  });
});

describe('telling a new account what this device holds', () => {
  const completed = (seedId: string) =>
    saveProgress({
      seedId,
      revision: 3,
      blockIndex: 5,
      answers: {},
      completedAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    });

  it('announces completions on sign-in, and hands the queue over', async () => {
    await completed('seed-1');
    await completed('seed-2');
    await recordCompletion({ uid: 'guest-1', seedId: 'seed-3', revision: 1 });

    const result = await migrateIdentity('guest-1', 'account-1', { announce: true });

    expect(result).toMatchObject({ from: 'guest-1', to: 'account-1', requeued: 1, backfilled: 2 });
    for (const item of await listOutbox()) expect(item.payload.uid).toBe('account-1');
  });

  it('says nothing on recovery — the queue already holds what is owed', async () => {
    await completed('seed-1');
    await recordCompletion({ uid: 'local-a', seedId: 'seed-1', revision: 3 });

    const result = await migrateIdentity('local-a', 'anon-1');

    expect(result).toMatchObject({ requeued: 1, backfilled: 0 });
    expect(await listOutbox()).toHaveLength(1);
  });

  it('leaves unfinished seeds out of the backfill', async () => {
    await saveProgress({
      seedId: 'seed-half',
      revision: 3,
      blockIndex: 2,
      answers: {},
      updatedAt: '2026-09-01T10:00:00.000Z',
    });

    expect(await migrateIdentity('guest-1', 'account-1', { announce: true })).toMatchObject({
      backfilled: 0,
    });
  });

  /**
   * Signing out and back in must not count a completion twice. The id is
   * derived from the fact, so the second announcement is a duplicate the server
   * discards rather than a second completion inflating a streak.
   */
  it('re-announces with the same id, so a second sign-in is a duplicate', async () => {
    await completed('seed-1');

    await migrateIdentity('guest-1', 'account-1', { announce: true });
    const first = (await listOutbox()).map((item) => item.id);

    await flush(async () => ({ status: 'applied' }), true);
    await migrateIdentity('guest-1', 'account-1', { announce: true });
    const second = (await listOutbox()).map((item) => item.id);

    expect(second).toEqual(first);
  });

  it('derives an id from the account, so two accounts get their own', () => {
    expect(backfillEventId('account-1', 'seed-1', 3, 'completed')).not.toBe(
      backfillEventId('account-2', 'seed-1', 3, 'completed')
    );
    expect(backfillEventId('account-1', 'seed-1', 3, 'completed')).toBe(
      backfillEventId('account-1', 'seed-1', 3, 'completed')
    );
    expect(backfillEventId('account-1', 'seed-1', 3, 'completed').length).toBeGreaterThanOrEqual(8);
  });
});
