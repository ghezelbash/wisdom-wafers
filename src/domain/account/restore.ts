import type { SavedDoc } from '@dananeh/content-schema';

import type { AccountPreferences, AccountSnapshot, SyncableProgress } from '@/domain/account/sync';
import {
  mergePreferences,
  mergeProgressLists,
  mergeReviews,
  mergeSaved,
  savedSeedIds,
} from '@/domain/account/sync';

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
  /** This device's current settings, with when they were last decided. */
  readLocalPreferences(): Promise<AccountPreferences | null>;
  /** Puts the winning settings back into the session. */
  applyPreferences(preferences: AccountPreferences): Promise<void>;
  /** Sends this device's settings when they are the newer of the two. */
  pushPreferences?(preferences: AccountPreferences): Promise<void>;
}

export interface RestoreResult {
  merged: number;
  /** Seeds the device learned about from the account. */
  gained: number;
  saved: number;
  reviewsRestored: number;
  /** Which side's settings won, or `none` when neither side had any. */
  preferences: 'remote' | 'local' | 'none';
}

export async function restoreAccount(uid: string, ports: RestorePorts): Promise<RestoreResult> {
  const [remote, local, localSaved, localPreferences] = await Promise.all([
    ports.pull(uid),
    ports.readLocal(),
    ports.readLocalSaved(),
    ports.readLocalPreferences(),
  ]);

  const knownLocally = new Set(local.map((item) => item.seedId));

  // Progress first, then the server-derived review schedule over the top.
  const merged = mergeReviews(mergeProgressLists(local, remote.progress), remote.reviews);
  const saved = mergeSaved(localSaved, remote.saved);

  await ports.writeLocal(merged);
  await ports.applySaved(savedSeedIds(saved));

  /**
   * The half that did not exist.
   *
   * `AccountSync.pull` returned the account's preferences and `mergePreferences`
   * knew what to do with them, and **nothing called either**: signing in on a
   * second phone restored the garden and then showed the default pace and an
   * empty set of interests. The reader's settings were the one thing that did
   * not travel.
   *
   * Whole-object last-write-wins on `updatedAt` (ADR 19). Not field by field:
   * they are a small self-consistent set chosen in one sitting, and merging
   * them per field produces a combination nobody picked.
   */
  const winner = mergePreferences(localPreferences, remote.preferences);
  let preferencesOutcome: RestoreResult['preferences'] = 'none';

  if (winner) {
    const remoteWon = winner === remote.preferences;
    preferencesOutcome = remoteWon ? 'remote' : 'local';

    await ports.applyPreferences(winner);
    // The device's own settings are newer, so the account has not heard them.
    if (!remoteWon && ports.pushPreferences) await ports.pushPreferences(winner);
  }

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
    preferences: preferencesOutcome,
  };
}
