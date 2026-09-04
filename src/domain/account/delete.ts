/**
 * Deleting an account, from the device's side.
 *
 * The order is the point. The server is asked first and has to answer `done`;
 * only then is anything on the device touched. Wiping first would leave a
 * reader looking at an empty app whose data is still on the server, believing
 * the opposite — which is the failure the audit called out about the old
 * screen, where the button did nothing but a local reset.
 */

export type DeleteFailure = 'requiresRecentLogin' | 'network' | 'partial' | 'unknown';

export class AccountDeletionError extends Error {
  constructor(
    readonly reason: DeleteFailure,
    readonly step?: string
  ) {
    super(reason);
    this.name = 'AccountDeletionError';
  }
}

export interface DeletionOutcome {
  documentsDeleted: number;
  objectsDeleted: number;
  /** Steps the server reported finishing, for the runbook and for support. */
  completed: string[];
}

export interface DeleteAccountPorts {
  /** The uid being deleted, captured before anything can change it. */
  uid: string;
  /** Step one: proves identity and returns a receipt. Destroys nothing. */
  beginServerDeletion(): Promise<string>;
  /** Remembers the receipt before the first destructive step. */
  storeReceipt(receipt: string): Promise<void>;
  clearReceipt(): Promise<void>;
  /** Step two, while a session still exists. */
  requestServerDeletion(receipt: string): Promise<DeletionOutcome>;
  /** Step two again, once it does not. */
  resumeServerDeletion(uid: string, receipt: string): Promise<DeletionOutcome>;
  /** What happened, for a device whose response went missing. */
  serverDeletionStatus(uid: string, receipt: string): Promise<{ state: string } | null>;
  /** Erases progress, the queue, the catalogue, downloads and the session. */
  wipeDevice(): Promise<void>;
  /** Starts over: a fresh anonymous reader, not a signed-out dead end. */
  startFreshIdentity(): Promise<void>;
}

/**
 * The whole operation.
 *
 * The order carries the design. A receipt is minted and written to the device
 * *before* anything is destroyed, because the Auth record goes last: a response
 * lost after that step leaves a device that can no longer authenticate, and
 * without the receipt it could neither finish the job nor find out whether it
 * had finished. It would have to guess whether the data was gone — and every
 * possible guess is wrong some of the time.
 *
 * With the receipt there is no unverifiable state. A lost response is resumed
 * without a session; a job already `done` is confirmed; and the device is wiped
 * only on a terminal `done`.
 */
export async function deleteAccountEverywhere(
  ports: DeleteAccountPorts
): Promise<DeletionOutcome> {
  const receipt = await ports.beginServerDeletion();
  await ports.storeReceipt(receipt);

  let outcome: DeletionOutcome;
  try {
    outcome = await ports.requestServerDeletion(receipt);
  } catch (error) {
    // The session may be gone precisely because the deletion got far enough to
    // remove it. Ask, then finish the job with the receipt.
    const status = await ports.serverDeletionStatus(ports.uid, receipt);

    if (status?.state === 'done') {
      outcome = { completed: [], documentsDeleted: 0, objectsDeleted: 0 };
    } else {
      // Resumable and idempotent: it skips what already finished.
      outcome = await ports.resumeServerDeletion(ports.uid, receipt).catch(() => {
        throw error instanceof AccountDeletionError ? error : toDeleteFailure(error);
      });
    }
  }

  // The server is done. From here a failure costs the reader a local wipe they
  // can retry, never their belief that data is gone when it is not.
  await ports.wipeDevice();
  await ports.clearReceipt();
  await ports.startFreshIdentity();

  return outcome;
}

/**
 * Finishes a deletion a previous session could not.
 *
 * Called at startup when a receipt is still on the device: either the response
 * was lost, or the app was killed between the server finishing and the wipe.
 * Returns whether anything was resolved.
 */
export async function resumeInterruptedDeletion(
  ports: Pick<
    DeleteAccountPorts,
    'uid' | 'resumeServerDeletion' | 'serverDeletionStatus' | 'wipeDevice' | 'clearReceipt' | 'startFreshIdentity'
  >,
  receipt: string
): Promise<boolean> {
  const status = await ports.serverDeletionStatus(ports.uid, receipt);

  if (status?.state !== 'done') {
    try {
      await ports.resumeServerDeletion(ports.uid, receipt);
    } catch {
      // Still unfinished. The receipt stays; the next launch tries again.
      return false;
    }
  }

  await ports.wipeDevice();
  await ports.clearReceipt();
  await ports.startFreshIdentity();
  return true;
}

/** Maps a callable's failure onto something a screen can say out loud. */
export function toDeleteFailure(error: unknown): AccountDeletionError {
  if (error instanceof AccountDeletionError) return error;

  const code = (error as { code?: string })?.code ?? '';
  const message = (error as { message?: string })?.message ?? '';

  if (message.includes('requires-recent-login') || code.includes('failed-precondition')) {
    return new AccountDeletionError('requiresRecentLogin');
  }
  if (code.includes('unavailable') || code.includes('deadline') || message.includes('network')) {
    return new AccountDeletionError('network');
  }
  if (message.includes('failed')) {
    return new AccountDeletionError('partial', (error as { details?: { step?: string } })?.details?.step);
  }
  return new AccountDeletionError('unknown');
}
