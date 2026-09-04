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
  /** Calls the server job. Throws on anything but a completed deletion. */
  requestServerDeletion(): Promise<DeletionOutcome>;
  /** Erases progress, the queue, the catalogue, downloads and the session. */
  wipeDevice(): Promise<void>;
  /** Starts over: a fresh anonymous reader, not a signed-out dead end. */
  startFreshIdentity(): Promise<void>;
}

/**
 * The whole operation.
 *
 * Retrying after a failure is safe: the server job is idempotent and resumes
 * from where it stopped, and the device wipe only ever runs once the server has
 * finished.
 */
export async function deleteAccountEverywhere(
  ports: DeleteAccountPorts
): Promise<DeletionOutcome> {
  const outcome = await ports.requestServerDeletion();

  // The server is done. From here a failure costs the reader a local wipe they
  // can retry, never their belief that data is gone when it is not.
  await ports.wipeDevice();
  await ports.startFreshIdentity();

  return outcome;
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
