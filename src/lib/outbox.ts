import {
  openOutbox,
  type OutboxItem,
  type OutboxKind,
  type OutboxStore,
} from '@/data/local/outbox-store';

/**
 * The outbox.
 *
 * Anything the app would send — a completed seed, a review, a content report —
 * is queued here first and drained when there is a connection. Nothing the
 * reader does is ever lost to being offline, and nothing blocks on the network.
 *
 * The contract with the transport is per item, and it is the whole point:
 *
 *  - `applied` / `duplicate` — the server counted it. Remove it.
 *  - `rejected` — the server never will. Keep it, dead, with the reason.
 *  - a thrown error — the network, not the content. Retry with backoff.
 *
 * The old queue treated every outcome as success and deleted the item, so a
 * malformed completion and a lost report both looked delivered.
 */
export type { OutboxItem, OutboxKind };

export type SendOutcome =
  | { status: 'applied' }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: string };

export type OutboxSender = (item: OutboxItem) => Promise<SendOutcome>;

let storePromise: Promise<OutboxStore> | null = null;

function store(): Promise<OutboxStore> {
  if (!storePromise) storePromise = openOutbox();
  return storePromise;
}

/** Used by tests to point the queue at a store of their own. */
export function __setOutboxStore(next: OutboxStore | null) {
  storePromise = next ? Promise.resolve(next) : null;
}

/**
 * Queues one item.
 *
 * The payload must already be the complete envelope the server expects: this
 * is not the place to discover that a field is missing, because by then the
 * reader has closed the seed.
 */
export async function enqueue(
  kind: OutboxKind,
  id: string,
  payload: Record<string, unknown>
): Promise<void> {
  await (await store()).add({ id, kind, payload });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return (await store()).all();
}

export async function deadLetters(): Promise<OutboxItem[]> {
  return (await listOutbox()).filter((item) => item.dead);
}

export interface FlushResult {
  sent: number;
  duplicates: number;
  rejected: number;
  failed: number;
  remaining: number;
}

/**
 * Drains what is due.
 *
 * `send` is injected so the transport can change without touching the queue's
 * semantics. Items past their backoff are tried in the order they were queued;
 * everything else is left exactly where it is.
 */
export async function flush(
  send: OutboxSender,
  isOnline: boolean,
  now = new Date()
): Promise<FlushResult> {
  const queue = await store();
  const empty = { sent: 0, duplicates: 0, rejected: 0, failed: 0 };

  if (!isOnline) {
    return { ...empty, remaining: (await queue.all()).length };
  }

  const due = await queue.due(now);
  const result = { ...empty };

  for (const item of due) {
    try {
      const outcome = await send(item);

      if (outcome.status === 'rejected') {
        await queue.recordRejection(item.id, outcome.reason);
        result.rejected += 1;
        continue;
      }

      await queue.remove(item.id);
      if (outcome.status === 'duplicate') result.duplicates += 1;
      else result.sent += 1;
    } catch (error) {
      await queue.recordFailure(
        item.id,
        error instanceof Error ? error.message : String(error),
        now
      );
      result.failed += 1;
    }
  }

  return { ...result, remaining: (await queue.all()).length };
}

/**
 * Hands every queued envelope to a new owner, after an identity migration.
 *
 * Returns how many moved. An envelope carries the uid it was built with, and
 * the server refuses one that does not match the caller — so without this, a
 * completion recorded before the reader signed in would dead-letter as
 * `uid-mismatch` and never be counted.
 */
export async function reassignQueuedUid(
  from: string,
  to: string,
  now = new Date()
): Promise<number> {
  return (await store()).reassignUid(from, to, now);
}

export async function clearOutbox(): Promise<void> {
  await (await store()).clear();
}
