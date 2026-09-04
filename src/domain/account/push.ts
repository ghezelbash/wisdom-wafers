import type { SavedDoc } from '@dananeh/content-schema';

import type { AccountPreferences } from '@/domain/account/sync';

/**
 * Sending a reader's own choices to their account.
 *
 * Preferences and bookmarks are the two things a reader sets directly, and
 * neither had a caller: `AccountSync` could push them and nothing ever did, so
 * a second device restored progress and then showed the default pace and an
 * empty garden.
 *
 * Three rules:
 *
 *  - **Offline first.** The local write has already happened by the time this
 *    runs. A push that fails costs a round trip, never the reader's choice.
 *  - **Guests do not push.** An anonymous or device-local reader has no account
 *    to push to, and writing under a uid that is about to change would strand
 *    the data.
 *  - **Failure is silent but not invisible.** It is reported to the crash sink
 *    with no personal content, because a preference that never syncs is a
 *    support ticket nobody can reproduce.
 */

export interface PushPorts {
  pushPreferences(uid: string, preferences: AccountPreferences): Promise<void>;
  pushSaved(uid: string, entries: SavedDoc[]): Promise<void>;
}

/** Built lazily so the Firebase SDK stays out of the startup path. */
export async function accountPushPorts(): Promise<PushPorts | null> {
  try {
    const [{ AccountSync }, { getDb, isFirebaseConfigured }] = await Promise.all([
      import('@/data/remote/account-sync'),
      import('@/data/remote/firebase-app'),
    ]);
    if (!isFirebaseConfigured) return null;

    const sync = new AccountSync(getDb());
    return {
      pushPreferences: (uid, preferences) => sync.pushPreferences(uid, preferences),
      pushSaved: (uid, entries) => sync.pushSaved(uid, entries),
    };
  } catch {
    return null;
  }
}

export interface PushContext {
  /** Null for a guest — nothing is pushed. */
  uid: string | null;
  isAccount: boolean;
  ports?: PushPorts | null;
}

async function resolve(context: PushContext): Promise<{ uid: string; ports: PushPorts } | null> {
  if (!context.uid || !context.isAccount) return null;
  const ports = context.ports ?? (await accountPushPorts());
  return ports ? { uid: context.uid, ports } : null;
}

/** Reports a sync failure without carrying anything the reader wrote. */
async function report(error: unknown, what: string) {
  try {
    const { reportError } = await import('@/platform/crash');
    reportError(error, { extra: { sync: what } });
  } catch {
    // Telemetry must never take a screen down with it.
  }
}

export async function pushPreferences(
  context: PushContext,
  preferences: AccountPreferences
): Promise<boolean> {
  const resolved = await resolve(context);
  if (!resolved) return false;

  try {
    await resolved.ports.pushPreferences(resolved.uid, preferences);
    return true;
  } catch (error) {
    await report(error, 'preferences');
    return false;
  }
}

export async function pushSaved(
  context: PushContext,
  entries: SavedDoc[]
): Promise<boolean> {
  if (!entries.length) return false;

  const resolved = await resolve(context);
  if (!resolved) return false;

  try {
    await resolved.ports.pushSaved(resolved.uid, entries);
    return true;
  } catch (error) {
    await report(error, 'saved');
    return false;
  }
}

/** A bookmark statement, with the moment it was made. */
export const savedEntry = (seedId: string, saved: boolean): SavedDoc => ({
  seedId,
  saved,
  updatedAt: new Date().toISOString(),
});
