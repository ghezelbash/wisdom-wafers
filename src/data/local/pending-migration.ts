import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A migration that has not finished.
 *
 * Identity migration hands the queue to a new owner and announces what this
 * device already holds. If it throws — no network at the moment of sign-in is
 * the ordinary case — the reader is nonetheless signed in, and everything they
 * did as a guest is addressed to a uid the server will now refuse.
 *
 * Refusing to sign them in would be worse, so the switch happens and the
 * unfinished work is recorded here instead. It is retried on the next launch
 * and whenever a connection appears, and it survives being force-stopped —
 * which the in-memory alternative did not.
 */

const KEY = 'dananeh.pendingMigration.v1';

export interface PendingMigration {
  from: string;
  to: string;
  /** Whether the new owner still needs to be told what this device holds. */
  announce: boolean;
  recordedAt: string;
  attempts: number;
  lastError?: string;
}

export async function readPendingMigration(): Promise<PendingMigration | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingMigration) : null;
  } catch {
    return null;
  }
}

export async function recordPendingMigration(
  input: { from: string; to: string; announce: boolean },
  error: unknown
): Promise<void> {
  const existing = await readPendingMigration();

  // Keep the *original* origin. A second failure while retrying must still
  // point at the uid the work was created under, not at an intermediate one.
  const from = existing && existing.to === input.from ? existing.from : input.from;

  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        from,
        to: input.to,
        announce: input.announce || (existing?.announce ?? false),
        recordedAt: existing?.recordedAt ?? new Date().toISOString(),
        attempts: (existing?.attempts ?? 0) + 1,
        lastError: String((error as Error)?.message ?? error).slice(0, 200),
      } satisfies PendingMigration)
    );
  } catch {
    // Nothing else to fall back to; the next sign-in tries again from scratch.
  }
}

export async function clearPendingMigration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // A stale record only costs a redundant retry, which is idempotent.
  }
}
