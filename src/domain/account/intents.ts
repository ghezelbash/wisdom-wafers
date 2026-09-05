import type { SavedDoc } from '@dananeh/content-schema';

import type { AccountPreferences } from '@/domain/account/sync';
import { enqueueState } from '@/lib/outbox';

/**
 * The reader's own choices, made durable.
 *
 * A preference or a bookmark used to be written to Firestore from the screen
 * that changed it: `pushPreferences` was called, a failure was reported to the
 * crash sink, and that was the end of it. A pace chosen on a train was never
 * sent, and nothing — not the app, not the reader, not an operator — could tell
 * afterwards that it had been lost.
 *
 * They go in the same outbox as everything else now. Three consequences, all of
 * them the point:
 *
 *  - offline costs nothing, and neither does a force-stop;
 *  - the retry, backoff, dead-letter and acknowledgement rules are the ones
 *    already written and tested, not a second set;
 *  - `reassignQueuedUid` already rewrites the owner on every queued envelope,
 *    so a change made as a guest arrives under the account it was linked into,
 *    and never under someone else's.
 *
 * ### Why these are queued by id rather than appended
 *
 * They are **state, not events**. A completion is a fact and every one has to
 * arrive; a pace has exactly one correct value and only the last is worth
 * sending. Dragging a slider thirty times leaves one row.
 */

/** One row per account. The last intent replaces the one before it. */
export const preferencesIntentId = (uid: string) => `prefs:${uid}`;

/** One row per bookmark. Saving and un-saving the same seed collapse. */
export const savedIntentId = (uid: string, seedId: string) => `saved:${uid}:${seedId}`;

export interface IntentOwner {
  /** Null for a guest — there is no account to send anything to. */
  uid: string | null;
  isAccount: boolean;
}

const owns = (owner: IntentOwner): owner is IntentOwner & { uid: string } =>
  Boolean(owner.uid) && owner.isAccount;

/**
 * Queues the reader's preferences.
 *
 * Returns whether anything was queued, so a caller can tell "sent later" from
 * "there is no account to send to" without inspecting the queue.
 */
export async function queuePreferences(
  owner: IntentOwner,
  preferences: AccountPreferences
): Promise<boolean> {
  if (!owns(owner)) return false;

  await enqueueState('account-preferences', preferencesIntentId(owner.uid), {
    uid: owner.uid,
    preferences,
  });
  return true;
}

/**
 * Queues one bookmark decision, including taking one away.
 *
 * A removal travels as `saved: false` rather than as a deletion: an absent
 * document is indistinguishable from one the account has never seen, so
 * deleting would make un-saving silently fail to reach a second device.
 */
export async function queueSaved(
  owner: IntentOwner,
  entry: SavedDoc
): Promise<boolean> {
  if (!owns(owner)) return false;

  await enqueueState('account-saved', savedIntentId(owner.uid, entry.seedId), {
    uid: owner.uid,
    entry,
  });
  return true;
}
