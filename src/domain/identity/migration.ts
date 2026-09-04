import { sha256Hex } from '@dananeh/content-schema';

import { reassignQueuedUid } from '@/lib/outbox';
import { recordProgressEvent } from '@/domain/progress/events';

/**
 * Moving what a reader has done from one uid to another.
 *
 * A uid changes three ways, and all of them must keep the reader's work:
 *
 *  - **recovery** — the app started with no backend and issued a `local-…` uid;
 *    the network came back and Firebase issued a real anonymous one;
 *  - **upgrade** — an anonymous session was linked to an account. The uid does
 *    *not* change here, which is the whole point of `linkWithCredential`;
 *  - **sign-in** — the reader signed into an account that already existed, so
 *    the new uid is genuinely a different owner.
 *
 * Progress on device is keyed by seed, not by uid, so it is already theirs. What
 * has to move is the queue — every envelope carries the uid it was built with,
 * and the server refuses one that does not match the caller.
 */

export interface MigrationResult {
  from: string;
  to: string;
  /** Queued envelopes rewritten to the new owner. */
  requeued: number;
  /** Completions on this device announced to the account for the first time. */
  backfilled: number;
}

/**
 * A stable id for a backfilled event.
 *
 * Backfill re-announces what is already on the device, and it can run more than
 * once — a reader who signs out and back in, or signs in on the same account
 * twice. Deriving the id from the fact itself rather than from a random value
 * makes the second run a duplicate the server discards, instead of a second
 * completion inflating a streak.
 */
export function backfillEventId(
  uid: string,
  seedId: string,
  revision: number,
  type: string
): string {
  return sha256Hex(`backfill:${uid}:${seedId}:${revision}:${type}`).slice(0, 40);
}

/**
 * Hands the queue to a new owner.
 *
 * Items that had already dead-lettered as `uid-mismatch` are revived: the
 * reason they failed no longer holds, and the reader's completion is still
 * waiting to be counted.
 */
export async function transferQueue(from: string, to: string): Promise<number> {
  if (!from || from === to) return 0;
  return reassignQueuedUid(from, to);
}

/** What a backfill needs to know about a seed this device has finished. */
export interface CompletedSeed {
  seedId: string;
  revision: number;
  completedAt?: string;
}

/**
 * Where the device's progress is read from.
 *
 * Injected, and imported lazily by default, so this module can be exercised
 * against a real database without dragging the whole key-value backend — and
 * every platform module it needs — into the graph.
 */
export type ProgressReader = () => Promise<CompletedSeed[]>;

const defaultReader: ProgressReader = async () => {
  // Resolved at call time, not at module load: this module is also exercised
  // in plain Node, where the key-value backend's platform modules do not exist.
  // `require` rather than a dynamic import because both Metro and the test
  // runner evaluate it lazily without needing ESM module support.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { listProgress } = require('@/lib/progress-store') as typeof import('@/lib/progress-store');
  return listProgress();
};

/**
 * Tells a newly signed-in account what this device already knows.
 *
 * Only completions, and only ones this device recorded — the account may have
 * more from elsewhere, and ingestion is monotonic, so nothing here can take a
 * completion away.
 */
export async function backfillCompletions(
  uid: string,
  read: ProgressReader = defaultReader
): Promise<number> {
  const stored = await read();
  const completed = stored.filter((item) => item.completedAt);

  let backfilled = 0;
  for (const item of completed) {
    try {
      await recordProgressEvent(
        {
          uid,
          seedId: item.seedId,
          revision: item.revision,
          type: 'completed',
          occurredAt: item.completedAt,
        },
        backfillEventId(uid, item.seedId, item.revision, 'completed')
      );
      backfilled += 1;
    } catch {
      // One unrepresentable row must not stop the rest; the reader's other
      // completions still belong on the account.
    }
  }

  return backfilled;
}

/**
 * The whole move.
 *
 * `announce` is false for recovery and for an in-place upgrade, where the queue
 * already holds everything the server has not seen. It is true for a sign-in,
 * where the account is a different owner that has never been told.
 */
export async function migrateIdentity(
  from: string | null,
  to: string,
  options: { announce?: boolean; read?: ProgressReader } = {}
): Promise<MigrationResult> {
  const requeued = from ? await transferQueue(from, to) : 0;
  const backfilled = options.announce ? await backfillCompletions(to, options.read) : 0;

  return { from: from ?? '', to, requeued, backfilled };
}
