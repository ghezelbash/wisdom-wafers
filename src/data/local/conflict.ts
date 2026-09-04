/**
 * Conflict policy for progress that exists in two places (§8.3).
 *
 * The rules are asymmetric on purpose: losing a completion is much worse than
 * double-counting a block view, so completion is monotonic and position takes
 * the furthest of the two.
 */
export interface MergeableProgress {
  seedId: string;
  revision: number;
  blockIndex: number;
  status: 'in_progress' | 'completed';
  saved?: boolean;
  completedAt?: string;
  updatedAt: string;
}

export function mergeProgress<T extends MergeableProgress>(local: T, remote: T): T {
  // Different revisions describe different block lists; the newer content wins
  // and its position is the only one that means anything.
  if (remote.revision > local.revision) return remote;
  if (local.revision > remote.revision) return local;

  const completed = local.status === 'completed' || remote.status === 'completed';
  const completedAt =
    [local.completedAt, remote.completedAt].filter(Boolean).sort()[0] ?? undefined;

  return {
    ...(local.updatedAt >= remote.updatedAt ? local : remote),
    revision: local.revision,
    blockIndex: Math.max(local.blockIndex, remote.blockIndex),
    status: completed ? 'completed' : 'in_progress',
    // A bookmark is an intent, and the most recent intent is the real one.
    saved: local.updatedAt >= remote.updatedAt ? local.saved : remote.saved,
    ...(completedAt ? { completedAt } : {}),
  };
}
