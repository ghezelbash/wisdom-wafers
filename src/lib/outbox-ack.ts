import type { OutboxItem, SendOutcome } from '@/lib/outbox';

/**
 * Reading one item's fate out of a batch answer.
 *
 * Kept apart from the transport because it is queue semantics, not networking:
 * the rule that decides whether a reader's completion is deleted or retried
 * should be testable without a Firebase SDK in the module graph.
 */
export interface BatchResult {
  applied?: number;
  duplicates?: number;
  rejected?: { id: string; reason: string }[];
}

/**
 * An answer that names neither an application nor a rejection is not treated as
 * success — the item stays queued and is tried again, because deleting it on an
 * unrecognised response is exactly how a completion goes missing.
 */
export function outcomeFor(item: OutboxItem, result: BatchResult): SendOutcome {
  const rejection = result.rejected?.find((entry) => entry.id === item.id);
  if (rejection) return { status: 'rejected', reason: rejection.reason };

  if ((result.applied ?? 0) > 0) return { status: 'applied' };
  if ((result.duplicates ?? 0) > 0) return { status: 'duplicate' };

  throw new Error('no-acknowledgement');
}
