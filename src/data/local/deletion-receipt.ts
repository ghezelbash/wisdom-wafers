import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The receipt for a deletion in progress.
 *
 * Written to the device *before* anything on the server is destroyed, and kept
 * until the deletion reaches a terminal state. Its whole purpose is the window
 * after the Auth record is gone: at that point the device can no longer
 * authenticate, so without this it could neither resume the job nor find out
 * whether it had finished — it would have to guess whether its data still
 * existed.
 *
 * Deliberately survives a force-stop, because that is one of the ways the
 * response gets lost.
 */

const KEY = 'dananeh.deletionReceipt.v1';

export interface DeletionReceipt {
  uid: string;
  receipt: string;
  requestedAt: string;
}

export async function readDeletionReceipt(): Promise<DeletionReceipt | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeletionReceipt) : null;
  } catch {
    return null;
  }
}

export async function storeDeletionReceipt(value: DeletionReceipt): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

export async function clearDeletionReceipt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // A stale receipt only costs one status check, which is idempotent.
  }
}
