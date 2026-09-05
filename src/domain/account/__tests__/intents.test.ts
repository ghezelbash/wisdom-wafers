import { KeyValueOutboxStore, type KeyValue } from '@/data/local/outbox-store';
import {
  preferencesIntentId,
  queuePreferences,
  queueSaved,
  savedIntentId,
} from '@/domain/account/intents';
import type { AccountPreferences } from '@/domain/account/sync';
import { __setOutboxStore, deadLetters, flush, listOutbox, reassignQueuedUid } from '@/lib/outbox';
import type { SendOutcome } from '@/lib/outbox';

/**
 * The reader's own choices, made durable.
 *
 * They used to be a direct Firestore write from the screen that changed them,
 * with the failure reported to the crash sink and forgotten. A pace chosen on a
 * train was never sent, and nothing afterwards could tell that it had been
 * lost.
 */

/** Survives a "restart": the map outlives the store built on top of it. */
function memoryKeyValue(map = new Map<string, string>()): KeyValue {
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue()));
});

afterEach(() => {
  __setOutboxStore(null);
});

const prefs = (updatedAt: string, pace: AccountPreferences['notificationPreferences']['pace']) => ({
  locale: 'fa-IR' as const,
  timezone: 'Asia/Tehran',
  interests: ['astronomy'],
  notificationPreferences: { pace, timeOfDay: 'evening', reminderTime: '20:30', enabled: true },
  updatedAt,
});

const account = { uid: 'reader-1', isAccount: true };

describe('who gets to queue', () => {
  it('queues for an account', async () => {
    expect(await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'))).toBe(true);
    expect(await listOutbox()).toHaveLength(1);
  });

  /** There is nothing to send to, and writing under a uid that is about to
   *  change would strand the data. */
  it('queues nothing for a guest', async () => {
    expect(
      await queuePreferences({ uid: 'guest-1', isAccount: false }, prefs('2026-09-05T10:00:00.000Z', 'one'))
    ).toBe(false);
    expect(
      await queueSaved({ uid: null, isAccount: false }, {
        seedId: 'seed-anchoring',
        saved: true,
        updatedAt: '2026-09-05T10:00:00.000Z',
      })
    ).toBe(false);
    expect(await listOutbox()).toHaveLength(0);
  });
});

describe('state, not events', () => {
  /**
   * Dragging a slider thirty times must not queue thirty rows. A completion is
   * a fact and every one has to arrive; a pace has one correct value.
   */
  it('keeps one row however many times preferences change', async () => {
    for (const pace of ['one', 'two', 'whenever', 'one', 'two'] as const) {
      await queuePreferences(account, prefs(`2026-09-05T10:0${pace.length}:00.000Z`, pace));
    }

    const queued = await listOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(preferencesIntentId('reader-1'));
    // The last intent, not the first.
    expect((queued[0].payload.preferences as AccountPreferences).notificationPreferences.pace).toBe('two');
  });

  it('keeps one row per bookmark, and saving then un-saving collapses', async () => {
    const entry = (saved: boolean, at: string) => ({ seedId: 'seed-anchoring', saved, updatedAt: at });

    await queueSaved(account, entry(true, '2026-09-05T10:00:00.000Z'));
    await queueSaved(account, entry(false, '2026-09-05T10:01:00.000Z'));
    await queueSaved(account, { seedId: 'seed-sleep', saved: true, updatedAt: '2026-09-05T10:02:00.000Z' });

    const queued = await listOutbox();
    expect(queued).toHaveLength(2);

    const anchoring = queued.find((item) => item.id === savedIntentId('reader-1', 'seed-anchoring'));
    // An un-save travels as `saved: false`, never as a deletion: an absent
    // document is indistinguishable from one the account has never seen.
    expect(anchoring?.payload.entry).toMatchObject({ saved: false });
  });

  it('keeps one account and another apart', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'));
    await queuePreferences({ uid: 'reader-2', isAccount: true }, prefs('2026-09-05T10:00:00.000Z', 'two'));

    expect(await listOutbox()).toHaveLength(2);
  });
});

describe('linking an account', () => {
  /**
   * A guest cannot queue, but progress events made before linking can be in the
   * queue already. Whatever is there must move to the new owner and never stay
   * under the old one.
   */
  it('rewrites the owner on everything queued', async () => {
    await queuePreferences({ uid: 'anon-1', isAccount: true }, prefs('2026-09-05T10:00:00.000Z', 'one'));
    await queueSaved({ uid: 'anon-1', isAccount: true }, {
      seedId: 'seed-anchoring',
      saved: true,
      updatedAt: '2026-09-05T10:00:00.000Z',
    });

    const moved = await reassignQueuedUid('anon-1', 'account-1');

    expect(moved).toBe(2);
    for (const item of await listOutbox()) {
      expect(item.payload.uid).toBe('account-1');
    }
  });
});

describe('offline, then a restart, then a reconnect', () => {
  const disk = new Map<string, string>();

  beforeEach(() => {
    disk.clear();
    __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue(disk)));
  });

  const restart = () => {
    // A new store over the same storage: the process died, the data did not.
    __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue(disk)));
  };

  it('keeps an intent across a force-stop and sends it on reconnect', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'whenever'));

    // Offline: the flush does nothing and takes nothing away.
    const offline = await flush(async () => ({ status: 'applied' }) as SendOutcome, false);
    expect(offline).toMatchObject({ sent: 0, remaining: 1 });

    restart();
    expect(await listOutbox()).toHaveLength(1);

    const sent: string[] = [];
    const online = await flush(async (item) => {
      sent.push(item.id);
      return { status: 'applied' } as SendOutcome;
    }, true);

    expect(online).toMatchObject({ sent: 1, remaining: 0 });
    expect(sent).toEqual([preferencesIntentId('reader-1')]);
  });

  it('sends the state as it was when the app died, not as it started', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'));
    await queuePreferences(account, prefs('2026-09-05T10:05:00.000Z', 'whenever'));
    restart();

    let delivered: AccountPreferences | null = null;
    await flush(async (item) => {
      delivered = item.payload.preferences as AccountPreferences;
      return { status: 'applied' } as SendOutcome;
    }, true);

    expect(delivered!.notificationPreferences.pace).toBe('whenever');
  });

  /**
   * A shape the rules refuse will never be accepted, however many times it is
   * sent. It dead-letters with the reason rather than retrying forever — and
   * the reason names a rule, not anything the reader wrote.
   */
  it('dead-letters an intent the server will never accept', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'));

    const result = await flush(
      async () => ({ status: 'rejected', reason: 'permission-denied' }) as SendOutcome,
      true
    );

    expect(result).toMatchObject({ rejected: 1, sent: 0 });

    const [dead] = await deadLetters();
    // The reason names a rule, not anything the reader chose or wrote.
    expect(dead.lastError).toBe('rejected: permission-denied');
    expect(dead.lastError).not.toContain('Asia/Tehran');
  });

  /** A transient failure keeps the intent and backs off. */
  it('keeps an intent when the network is the problem', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'));

    const result = await flush(async () => {
      throw new Error('offline');
    }, true);

    expect(result).toMatchObject({ failed: 1, remaining: 1 });
    expect(await deadLetters()).toHaveLength(0);
    expect((await listOutbox())[0].attempts).toBe(1);
  });

  /**
   * Signing out and back in as somebody else must not send device A's intent
   * under device B's uid.
   */
  it('never sends one account\u2019s intent under another\u2019s uid', async () => {
    await queuePreferences(account, prefs('2026-09-05T10:00:00.000Z', 'one'));
    await reassignQueuedUid('reader-1', 'reader-2');

    const owners: unknown[] = [];
    await flush(async (item) => {
      owners.push(item.payload.uid);
      return { status: 'applied' } as SendOutcome;
    }, true);

    expect(owners).toEqual(['reader-2']);
  });
});
