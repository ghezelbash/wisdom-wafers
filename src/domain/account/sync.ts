import { mergeProgress, type MergeableProgress } from '@/data/local/conflict';

/**
 * Reconciling an account with a device.
 *
 * Signing in on a second phone has to bring back what the first one did, and
 * two devices used on the same day have to end up agreeing. The policy is the
 * blueprint's §8.3, and it is deliberately asymmetric: losing a completion is
 * much worse than double-counting a block view, so completion is monotonic and
 * position takes the furthest of the two.
 *
 * Nothing here talks to Firestore. It is given both sides and returns what the
 * device should hold, which is what makes the policy testable on its own.
 */

export interface SyncableProgress extends MergeableProgress {
  reviewedAt?: string;
  reviewInterval?: number;
  reviewCount?: number;
}

export interface AccountPreferences {
  locale: string;
  timezone: string;
  interests: string[];
  notificationPreferences: {
    pace: string | null;
    timeOfDay: string | null;
    reminderTime: string | null;
    enabled: boolean;
  };
  updatedAt: string;
}

export interface AccountSnapshot {
  preferences: AccountPreferences | null;
  progress: SyncableProgress[];
  saved: string[];
  reviews: { seedId: string; reviewedAt: string; interval: number; count: number }[];
}

/**
 * Merges the account's progress into the device's.
 *
 * A seed either side knows about survives; a seed both know about is merged by
 * the shared policy. Review state travels with whichever side is newer, because
 * an interval belongs to the attempt that produced it — taking the maximum of
 * two intervals would invent a schedule neither device ever computed.
 */
export function mergeProgressLists(
  local: SyncableProgress[],
  remote: SyncableProgress[]
): SyncableProgress[] {
  const byId = new Map<string, SyncableProgress>();
  for (const item of local) byId.set(item.seedId, item);

  for (const incoming of remote) {
    const existing = byId.get(incoming.seedId);
    if (!existing) {
      byId.set(incoming.seedId, incoming);
      continue;
    }

    const merged = mergeProgress(existing, incoming);
    const newer = incoming.updatedAt > existing.updatedAt ? incoming : existing;

    byId.set(incoming.seedId, {
      ...merged,
      reviewedAt: newer.reviewedAt,
      reviewInterval: newer.reviewInterval,
      // Reviews are counted, not merged: the larger count is the one that has
      // actually happened, across however many devices did them.
      reviewCount: Math.max(existing.reviewCount ?? 0, incoming.reviewCount ?? 0),
    });
  }

  return [...byId.values()].sort((a, b) => a.seedId.localeCompare(b.seedId));
}

/**
 * A bookmark is an intent, and two devices can disagree about it.
 *
 * The union is wrong — un-saving on one device would never stick. Last write
 * wins per seed, which is why the set is compared against when each side last
 * changed rather than merged blindly.
 */
export function mergeSaved(
  local: { saved: string[]; updatedAt: string },
  remote: { saved: string[]; updatedAt: string }
): string[] {
  return [...(local.updatedAt >= remote.updatedAt ? local.saved : remote.saved)].sort();
}

/**
 * Preferences are last-write-wins on `updatedAt`.
 *
 * They are a small, self-consistent set a reader chose in one sitting —
 * merging them field by field would produce a combination nobody picked, like a
 * pace from one device and a reminder time from another.
 */
export function mergePreferences(
  local: AccountPreferences | null,
  remote: AccountPreferences | null
): AccountPreferences | null {
  if (!local) return remote;
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}
