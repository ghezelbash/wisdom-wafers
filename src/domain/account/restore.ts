import type { AccountSnapshot, SyncableProgress } from '@/domain/account/sync';
import { mergeProgressLists } from '@/domain/account/sync';

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
  writeLocal(progress: SyncableProgress[]): Promise<void>;
  /** Bookmarks live with progress on device; applied as a set. */
  applySaved(seedIds: string[]): Promise<void>;
}

export interface RestoreResult {
  merged: number;
  /** Seeds the device learned about from the account. */
  gained: number;
  saved: number;
}

export async function restoreAccount(uid: string, ports: RestorePorts): Promise<RestoreResult> {
  const [remote, local] = await Promise.all([ports.pull(uid), ports.readLocal()]);

  const knownLocally = new Set(local.map((item) => item.seedId));
  const merged = mergeProgressLists(local, remote.progress);

  await ports.writeLocal(merged);
  await ports.applySaved(remote.saved);

  return {
    merged: merged.length,
    gained: remote.progress.filter((item) => !knownLocally.has(item.seedId)).length,
    saved: remote.saved.length,
  };
}
