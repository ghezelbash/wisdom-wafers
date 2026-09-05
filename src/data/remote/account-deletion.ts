import { getApps } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { usingEmulator } from '@/data/remote/firebase-app';
import { AccountDeletionError, toDeleteFailure, type DeletionOutcome } from '@/domain/account/delete';

/**
 * Asking the server to erase the account.
 *
 * Three calls, because one is not enough. The Auth record is deleted last, so
 * a response lost after that step leaves a device that cannot authenticate and
 * therefore cannot ask what happened. `begin` mints a receipt *before* anything
 * is destroyed; `resume` and `status` take that receipt instead of a session.
 */

function callable(name: string) {
  const app = getApps()[0];
  if (!app) throw new AccountDeletionError('network');

  const functions = getFunctions(app, 'europe-west1');
  if (usingEmulator) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return httpsCallable(functions, name);
}

/** Step one: prove who you are, and take a receipt. Destroys nothing. */
export async function beginServerDeletion(): Promise<string> {
  try {
    const response = await callable('beginDeleteMyAccount')({});
    const receipt = (response.data as { receipt?: string })?.receipt;
    if (!receipt) throw new AccountDeletionError('unknown');
    return receipt;
  } catch (error) {
    throw toDeleteFailure(error);
  }
}

function readOutcome(data: unknown): DeletionOutcome {
  const result = (data ?? {}) as {
    state?: string;
    completed?: string[];
    documentsDeleted?: number;
    objectsDeleted?: number;
  };

  // Anything short of `done` leaves data on the server, and the device must
  // not be wiped as if it did not.
  if (result.state !== 'done') {
    throw new AccountDeletionError('partial', result.completed?.at(-1));
  }

  return {
    completed: result.completed ?? [],
    documentsDeleted: result.documentsDeleted ?? 0,
    objectsDeleted: result.objectsDeleted ?? 0,
  };
}

/** Step two, while the session still exists. */
export async function requestServerDeletion(receipt?: string): Promise<DeletionOutcome> {
  try {
    return readOutcome((await callable('deleteMyAccount')({ receipt })).data);
  } catch (error) {
    throw toDeleteFailure(error);
  }
}

/** Step two again, when the session no longer does. */
export async function resumeServerDeletion(
  uid: string,
  receipt: string
): Promise<DeletionOutcome> {
  try {
    return readOutcome((await callable('resumeDeleteMyAccount')({ uid, receipt })).data);
  } catch (error) {
    throw toDeleteFailure(error);
  }
}

/**
 * What happened, for a device whose response went missing.
 *
 * Returns null when the job is not finished, rather than throwing: "not done
 * yet" is an answer, and the caller retries rather than reporting a failure.
 */
export async function serverDeletionStatus(
  uid: string,
  receipt: string
): Promise<{ state: string; completed: string[] } | null> {
  try {
    const response = await callable('myAccountDeletionStatus')({ uid, receipt });
    return (response.data ?? null) as { state: string; completed: string[] } | null;
  } catch {
    return null;
  }
}
