import type { SavedDoc } from '@dananeh/content-schema';

import type { AccountSnapshot, SyncableProgress } from '@/domain/account/sync';
import { mergeProgressLists, mergeReviews, mergeSaved, savedSeedIds } from '@/domain/account/sync';

/**
 * Bringing an account down onto a device.
 *
 * Signing in on a second phone has to give the reader their garden back. What
 * arrives is merged, never assigned: the device may know things the account has
 * not heard yet — a seed finished on a plane, still in the queue — and a plain
 * overwrite would erase exactly that.
 *
 * The ports are injected so the policy can be tested against a real database
 * without a Firebase SDK in the graph.
 */

export interface RestorePorts {
  pull(uid: string): Promise<AccountSnapshot>;
  readLocal(): Promise<SyncableProgress[]>;
  /** This device's bookmarks and un-bookmarks, with when each was decided. */
  readLocalSaved(): Promise<SavedDoc[]>;
  writeLocal(progress: SyncableProgress[]): Promise<void>;
  /** Bookmarks live with progress on device; applied as a set. */
  applySaved(seedIds: string[]): Promise<void>;
  /** Sends back what the account had not heard yet. Optional — a read-only
   *  restore is still useful when the push cannot run. */
  pushSaved?(entries: SavedDoc[]): Promise<void>;
}

export interface RestoreResult {
  merged: number;
  /** Seeds the device learned about from the account. */
  gained: number;
  saved: number;
  reviewsRestored: number;
}

export async function restoreAccount(uid: string, ports: RestorePorts): Promise<RestoreResult> {
  const [remote, local, localSaved] = await Promise.all([
    ports.pull(uid),
    ports.readLocal(),
    ports.readLocalSaved(),
  ]);

  const knownLocally = new Set(local.map((item) => item.seedId));

  // Progress first, then the server-derived review schedule over the top.
  const merged = mergeReviews(mergeProgressLists(local, remote.progress), remote.reviews);
  const saved = mergeSaved(localSaved, remote.saved);

  await ports.writeLocal(merged);
  await ports.applySaved(savedSeedIds(saved));

  // Anything the account did not have, or had an older statement about.
  if (ports.pushSaved) {
    const remoteById = new Map(remote.saved.map((entry) => [entry.seedId, entry]));
    const unheard = saved.filter((entry) => {
      const known = remoteById.get(entry.seedId);
      return !known || known.updatedAt < entry.updatedAt;
    });
    if (unheard.length) await ports.pushSaved(unheard);
  }

  return {
    merged: merged.length,
    gained: remote.progress.filter((item) => !knownLocally.has(item.seedId)).length,
    saved: savedSeedIds(saved).length,
    reviewsRestored: remote.reviews.length,
  };
}
