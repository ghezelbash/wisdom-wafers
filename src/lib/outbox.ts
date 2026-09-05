import { ThrottledError } from '@/lib/outbox-ack';
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
 *  - `ThrottledError` — the server said *not yet*. Defer that endpoint's items,
 *    spending no attempt. Other endpoints keep draining.
 *  - any other thrown error — the network, not the content. Retry with backoff.
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
  payload: Record<string, unknown>,
  now?: Date
): Promise<void> {
  await (await store()).add({ id, kind, payload }, now);
}

/**
 * Queues state, replacing whatever was queued under the same id.
 *
 * `enqueue` is for events — facts that happened, each of which has to arrive.
 * This is for the reader's current answer to a question: a pace, or whether one
 * seed is bookmarked. Only the last one is worth sending, and queueing every
 * intermediate value is how a queue grows without bound.
 */
export async function enqueueState(
  kind: OutboxKind,
  id: string,
  payload: Record<string, unknown>,
  now?: Date
): Promise<void> {
  await (await store()).put({ id, kind, payload }, now);
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
  /** Deferred by the server, still owed, with their retry budget intact. */
  throttled: number;
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
  now = new Date(),
  /**
   * Which endpoint an item is bound for.
   *
   * Only used to decide who has to wait when one endpoint throttles. It
   * defaults to the item's kind, which is right whenever a kind maps to one
   * endpoint — the transport passes a truer answer for the two telemetry kinds
   * that share one.
   */
  scopeOf: (item: OutboxItem) => string = (item) => item.kind
): Promise<FlushResult> {
  const queue = await store();
  const empty = { sent: 0, duplicates: 0, rejected: 0, failed: 0, throttled: 0 };

  if (!isOnline) {
    return { ...empty, remaining: (await queue.all()).length };
  }

  const due = await queue.due(now);
  const result = { ...empty };

  /** Endpoints the server has already told us to wait on, and until when. */
  const waiting = new Map<string, Date>();

  for (const item of due) {
    const scope = scopeOf(item);

    const until = waiting.get(scope);
    if (until) {
      // Its endpoint is throttled. Defer it too rather than spending a refused
      // round trip on it — but keep going: a queue of completions must not be
      // held up behind a throttled batch of analytics.
      await queue.defer(item.id, until);
      result.throttled += 1;
      continue;
    }

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
      if (error instanceof ThrottledError) {
        const until = new Date(now.getTime() + error.retryAfterSeconds * 1000);
        await queue.defer(item.id, until);
        result.throttled += 1;
        // Keyed by the item's own scope, which is what later items are
        // compared against — the limit is per endpoint, not per item.
        waiting.set(scope, until);
        continue;
      }

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
