import { getApps } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { usingEmulator } from '@/data/remote/firebase-app';
import { AccountDeletionError, toDeleteFailure, type DeletionOutcome } from '@/domain/account/delete';

/**
 * Asking the server to erase the account.
 *
 * The Function is the only thing that can: subcollections, Storage files, push
 * tokens and the Auth record are all out of a client's reach. This wrapper's
 * one job is to make sure an incomplete answer is never read as success.
 */
export async function requestServerDeletion(): Promise<DeletionOutcome> {
  const app = getApps()[0];
  if (!app) throw new AccountDeletionError('network');

  const functions = getFunctions(app, 'europe-west1');
  if (usingEmulator) connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  try {
    const response = await httpsCallable(functions, 'deleteMyAccount')({});
    const result = (response.data ?? {}) as {
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
  } catch (error) {
    throw toDeleteFailure(error);
  }
}
