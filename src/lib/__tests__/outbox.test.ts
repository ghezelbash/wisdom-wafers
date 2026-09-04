import { KeyValueOutboxStore, type KeyValue } from '@/data/local/outbox-store';
import { MAX_ATTEMPTS } from '@/data/local/retry';
import {
  __setOutboxStore,
  clearOutbox,
  deadLetters,
  enqueue,
  flush,
  listOutbox,
  type OutboxItem,
  type SendOutcome,
} from '@/lib/outbox';
import { outcomeFor } from '@/lib/outbox-ack';

/**
 * The queue's contract with the transport.
 *
 * These are the rules that decide whether a reader's completion survives a bad
 * network, so they are asserted rather than assumed: an item leaves the queue
 * only when the server says it counted, and a rejection is kept with its
 * reason instead of vanishing like a success.
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

beforeEach(() => {
  __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue()));
});

afterEach(() => {
  __setOutboxStore(null);
});

const anEvent = (id: string) => enqueue('progress-event', id, { id, type: 'completed' });

describe('queueing', () => {
  it('keeps what has not been sent', async () => {
    await anEvent('event-1');
    const items = await listOutbox();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'event-1', kind: 'progress-event', attempts: 0 });
  });

  it('ignores a second enqueue of the same id', async () => {
    await anEvent('event-1');
    await anEvent('event-1');

    expect(await listOutbox()).toHaveLength(1);
  });

  it('sends nothing while offline, and keeps everything', async () => {
    await anEvent('event-1');
    const result = await flush(async () => ({ status: 'applied' }), false);

    expect(result).toMatchObject({ sent: 0, remaining: 1 });
    expect(await listOutbox()).toHaveLength(1);
  });
});

describe('what the server said', () => {
  it('removes an item the server applied', async () => {
    await anEvent('event-1');
    const result = await flush(async () => ({ status: 'applied' }), true);

    expect(result).toMatchObject({ sent: 1, remaining: 0 });
    expect(await listOutbox()).toHaveLength(0);
  });

  // A retry after a dropped connection: the server has it, the client does not
  // know that yet. Treating it as a failure would retry forever.
  it('removes an item the server had already seen', async () => {
    await anEvent('event-1');
    const result = await flush(async () => ({ status: 'duplicate' }), true);

    expect(result).toMatchObject({ duplicates: 1, remaining: 0 });
    expect(await listOutbox()).toHaveLength(0);
  });

  it('keeps a rejected item, dead, with its reason', async () => {
    await anEvent('event-1');
    const result = await flush(async () => ({ status: 'rejected', reason: 'uid-mismatch' }), true);

    expect(result).toMatchObject({ rejected: 1, remaining: 1 });
    const [dead] = await deadLetters();
    expect(dead).toMatchObject({ id: 'event-1', dead: true });
    expect(dead.lastError).toContain('uid-mismatch');
  });

  it('does not retry a dead letter', async () => {
    await anEvent('event-1');
    await flush(async () => ({ status: 'rejected', reason: 'invalid' }), true);

    let calls = 0;
    await flush(async () => {
      calls += 1;
      return { status: 'applied' } as SendOutcome;
    }, true, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    expect(calls).toBe(0);
  });

  it('retries a transport failure with backoff rather than dropping it', async () => {
    await anEvent('event-1');
    // Just after the item was queued, so it is genuinely due.
    const now = new Date(Date.now() + 1_000);
    const result = await flush(async () => {
      throw new Error('network-request-failed');
    }, true, now);

    expect(result).toMatchObject({ failed: 1, remaining: 1 });

    const [item] = await listOutbox();
    expect(item.attempts).toBe(1);
    expect(item.dead).toBe(false);
    expect(item.lastError).toContain('network-request-failed');
    // Not due again immediately: the whole point of the backoff.
    expect(new Date(item.nextAttemptAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it('gives up after the attempt ceiling, keeping the item so the failure is visible', async () => {
    await anEvent('event-1');
    // A day between attempts, which clears any backoff the policy schedules.
    let at = new Date(Date.now() + 1_000);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await flush(async () => {
        throw new Error('network-request-failed');
      }, true, at);
      at = new Date(at.getTime() + 24 * 60 * 60 * 1000);
    }

    const [item] = await listOutbox();
    expect(item.dead).toBe(true);
    expect(item.attempts).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
  });

  it('sends each queued item exactly once per drain', async () => {
    await anEvent('event-1');
    await anEvent('event-2');

    const seen: string[] = [];
    await flush(async (item) => {
      seen.push(item.id);
      return { status: 'applied' };
    }, true);

    expect(seen).toEqual(['event-1', 'event-2']);
    expect(await listOutbox()).toHaveLength(0);
  });

  it('clears everything on request', async () => {
    await anEvent('event-1');
    await clearOutbox();
    expect(await listOutbox()).toHaveLength(0);
  });
});

describe('reading a batch answer', () => {
  const item = { id: 'event-1', kind: 'progress-event' } as OutboxItem;

  it('reads an application', () => {
    expect(outcomeFor(item, { applied: 1, duplicates: 0, rejected: [] })).toEqual({
      status: 'applied',
    });
  });

  it('reads a duplicate', () => {
    expect(outcomeFor(item, { applied: 0, duplicates: 1, rejected: [] })).toEqual({
      status: 'duplicate',
    });
  });

  it('reads a rejection with its reason', () => {
    expect(
      outcomeFor(item, { applied: 0, duplicates: 0, rejected: [{ id: 'event-1', reason: 'invalid' }] })
    ).toEqual({ status: 'rejected', reason: 'invalid' });
  });

  // The failure that lost completions: a response nobody understood was read as
  // success, and the item was deleted.
  it('refuses to treat an unrecognised answer as delivery', () => {
    expect(() => outcomeFor(item, {})).toThrow('no-acknowledgement');
    expect(() => outcomeFor(item, { applied: 0, duplicates: 0, rejected: [] })).toThrow();
  });
});
