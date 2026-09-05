import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Deps } from '../shared/deps';

/**
 * Erasing an account, for real.
 *
 * The screen promises the account, the progress, the reflections and the
 * downloads are gone. Keeping that promise means reaching six places a client
 * cannot: the subcollections under `users/{uid}`, the aggregates keyed on the
 * uid outside it, the reader's files in Storage, their push tokens, the Auth
 * record itself, and only then the device.
 *
 * Two properties carry the whole design:
 *
 *  - **Idempotent.** A deletion that dies halfway is resumed by running it
 *    again. Every step tolerates its target already being gone, and the job
 *    document records how far it got.
 *  - **Never a false "deleted".** The device wipes only after this reports
 *    `done`. A partial failure leaves the reader signed in and told, rather than
 *    looking at an empty app whose data is still on the server.
 */

/** Subcollections under `users/{uid}` that hold the reader's own record. */
export const USER_SUBCOLLECTIONS = [
  'progress',
  'saved',
  'reviews',
  'devices',
  'daily',
  'eventLog',
] as const;

/** Top-level documents keyed on the uid. */
const USER_KEYED_DOCUMENTS = ['userStats', 'entitlements'] as const;

export type DeletionState = 'requested' | 'running' | 'done' | 'failed';

export interface DeletionJob {
  uid: string;
  state: DeletionState;
  startedAt: string;
  finishedAt?: string;
  /** Every step that has completed, so a resumed run can skip it. */
  completed: string[];
  error?: string;
  /**
   * Digests of the capabilities that outlive the account — **never the
   * capabilities themselves**.
   *
   * The Auth record is deleted last, so a response lost after that step leaves
   * a device that can no longer authenticate and therefore cannot ask what
   * happened. The receipt is minted before anything is destroyed, handed to
   * the device, and stays a valid way to ask about this one job afterwards.
   *
   * What is stored is the SHA-256 of the receipt, so a reader of the database
   * — a backup, an export, an operator with console access — holds something
   * that cannot be replayed. The previous version stored the bearer secret in
   * plaintext, and minted it from `Math.random`, which is not a CSPRNG: 128
   * bits of predictable output, described in the comments as 256 bits of
   * secret. Both halves of that were wrong.
   *
   * A list because `begin` called twice must not invalidate a receipt the
   * device has already stored — that is exactly the case the receipt exists
   * for. Capped, oldest dropped first.
   */
  receiptDigests?: string[];
  /** The digest scheme in use, so it can be changed without guessing. */
  receiptVersion?: number;
}

/** The only scheme there has ever been that stores a digest rather than the secret. */
export const RECEIPT_VERSION = 1;

/** 256 bits. base64url of 32 bytes is exactly 43 characters, no padding. */
export const RECEIPT_BYTES = 32;
export const RECEIPT_LENGTH = 43;

/** At most three live capabilities per job — see `receiptDigests`. */
export const MAX_RECEIPT_DIGESTS = 3;

/**
 * A receipt: 256 bits from the platform CSPRNG, base64url so it survives a URL,
 * a JSON body and a callable argument without escaping.
 */
export function mintReceipt(): string {
  return randomBytes(RECEIPT_BYTES).toString('base64url');
}

/** Exactly what `mintReceipt` produces, and nothing else. */
export function isWellFormedReceipt(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function receiptDigest(receipt: string): string {
  return createHash('sha256').update(receipt, 'utf8').digest('hex');
}

/**
 * Compares two digests without letting the time taken describe the difference.
 *
 * Both are fixed-length hex of the same hash, so lengths never disagree in
 * practice; the guard is there because `timingSafeEqual` throws on a mismatch,
 * and a thrown comparison would be an oracle of a different kind.
 */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** Whether a presented receipt is one of the capabilities this job issued. */
export function receiptMatches(job: DeletionJob | undefined, presented: unknown): boolean {
  if (!job || !isWellFormedReceipt(presented)) return false;

  const digests = job.receiptDigests ?? [];
  if (!digests.length) return false;

  const candidate = receiptDigest(presented);
  // Every digest is compared: returning early on the first match would make the
  // time taken describe which capability was used.
  return digests.reduce<boolean>(
    (found, stored) => (digestsMatch(stored, candidate) ? true : found),
    false
  );
}

export class DeletionError extends Error {
  constructor(
    readonly code: 'requires-recent-login' | 'failed',
    readonly step?: string,
    readonly cause?: unknown
  ) {
    super(code);
    this.name = 'DeletionError';
  }
}

/**
 * How recent a sign-in has to be.
 *
 * Deleting everything is exactly the operation a borrowed unlocked phone should
 * not be able to perform, so the caller has to have proved who they are inside
 * this window.
 */
export const RECENT_LOGIN_WINDOW_SECONDS = 5 * 60;

export function isRecentLogin(authTimeSeconds: number | undefined, now: Date): boolean {
  if (!authTimeSeconds) return false;
  return now.getTime() / 1000 - authTimeSeconds <= RECENT_LOGIN_WINDOW_SECONDS;
}

/** Deletes a collection in batches, tolerating one that is already empty. */
async function deleteCollection(deps: Deps, path: string, batchSize = 300): Promise<number> {
  let deleted = 0;

  for (;;) {
    const snapshot = await deps.db.collection(path).limit(batchSize).get();
    if (snapshot.empty) return deleted;

    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
    deleted += snapshot.size;

    // A collection smaller than one page is finished; anything else loops.
    if (snapshot.size < batchSize) return deleted;
  }
}

export interface DeleteAccountResult {
  uid: string;
  state: DeletionState;
  completed: string[];
  documentsDeleted: number;
  objectsDeleted: number;
}

/**
 * The job document is kept after `done`.
 *
 * It is the only thing left that can answer "was my account deleted?" for a
 * device whose response went missing, and it holds nothing personal — a uid
 * with no account behind it, and a list of step names.
 */

/**
 * Step one: prove who you are, and take a receipt.
 *
 * Nothing is destroyed here. It exists so the device holds a way to ask about
 * the job *after* the account it belonged to is gone.
 */
export async function beginAccountDeletion(
  deps: Deps,
  input: { uid: string; authTimeSeconds?: number }
): Promise<{ receipt: string; state: DeletionState }> {
  if (!isRecentLogin(input.authTimeSeconds, deps.now())) {
    throw new DeletionError('requires-recent-login');
  }

  const jobRef = deps.db.collection('deletionJobs').doc(input.uid);
  const existing = (await jobRef.get()).data() as DeletionJob | undefined;
  const resuming = Boolean(existing && existing.state !== 'done');

  /**
   * A second `begin` continues the same job and issues another capability.
   *
   * It cannot return the first one — nothing stores it, which is the point —
   * and it must not invalidate it either, because a device that already holds
   * one is precisely the case this exists for. So the earlier digests stay,
   * capped, and a job carries at most three live receipts.
   */
  const receipt = mintReceipt();
  const digests = [...(resuming ? (existing?.receiptDigests ?? []) : []), receiptDigest(receipt)]
    .slice(-MAX_RECEIPT_DIGESTS);

  await jobRef.set({
    uid: input.uid,
    state: (resuming ? (existing?.state ?? 'requested') : 'requested') satisfies DeletionState,
    startedAt: resuming ? (existing?.startedAt ?? deps.now().toISOString()) : deps.now().toISOString(),
    completed: resuming ? (existing?.completed ?? []) : [],
    receiptDigests: digests,
    receiptVersion: RECEIPT_VERSION,
  });

  return { receipt, state: resuming ? (existing?.state ?? 'requested') : 'requested' };
}

/**
 * What happened to a job, for a device that can no longer authenticate.
 *
 * Answers only for a matching receipt, and says nothing about the account
 * beyond the state of its own deletion.
 */
export async function accountDeletionStatus(
  deps: Deps,
  input: { uid: string; receipt: string }
): Promise<{ state: DeletionState; completed: string[] } | null> {
  const snapshot = await deps.db.collection('deletionJobs').doc(input.uid).get();
  const job = snapshot.data() as DeletionJob | undefined;

  // One answer for "no such job", "wrong uid" and "wrong receipt": null.
  if (!receiptMatches(job, input.receipt)) return null;
  return { state: job!.state, completed: job!.completed ?? [] };
}

export async function deleteAccount(
  deps: Deps,
  input: { uid: string; authTimeSeconds?: number; receipt?: string }
): Promise<DeleteAccountResult> {
  const { uid } = input;
  const jobRef = deps.db.collection('deletionJobs').doc(uid);
  const existing = (await jobRef.get()).data() as DeletionJob | undefined;

  /**
   * Either a fresh recent sign-in, or the receipt from one.
   *
   * The receipt is what lets a resumed run finish after the Auth record has
   * gone — at which point there is no session left to prove anything with, and
   * refusing would leave the account permanently half-deleted.
   */
  const hasReceipt = receiptMatches(existing, input.receipt);
  if (!hasReceipt && !isRecentLogin(input.authTimeSeconds, deps.now())) {
    throw new DeletionError('requires-recent-login');
  }

  // A resumed run skips what already finished, so retrying after a timeout
  // cannot half-delete anything twice or report a step it did not do.
  const completed = new Set(existing?.state === 'done' ? [] : (existing?.completed ?? []));

  await jobRef.set(
    {
      uid,
      state: 'running' satisfies DeletionState,
      startedAt: existing?.startedAt ?? deps.now().toISOString(),
      completed: [...completed],
      // A job created here — `deleteMyAccount` called without `begin` — carries
      // no capability, because there is nobody to hand one to. That caller
      // proved a recent sign-in, which is the other way in.
      ...(existing?.receiptDigests?.length
        ? {}
        : { receiptDigests: [], receiptVersion: RECEIPT_VERSION }),
    },
    { merge: true }
  );

  let documentsDeleted = 0;
  let objectsDeleted = 0;

  const step = async (name: string, work: () => Promise<void>) => {
    if (completed.has(name)) return;
    try {
      await work();
    } catch (error) {
      await jobRef.set(
        {
          state: 'failed' satisfies DeletionState,
          completed: [...completed],
          error: `${name}: ${(error as Error)?.message ?? 'unknown'}`,
          finishedAt: deps.now().toISOString(),
        },
        { merge: true }
      );
      throw new DeletionError('failed', name, error);
    }

    completed.add(name);
    await jobRef.set({ completed: [...completed] }, { merge: true });
  };

  for (const name of USER_SUBCOLLECTIONS) {
    await step(`users/${name}`, async () => {
      documentsDeleted += await deleteCollection(deps, `users/${uid}/${name}`);
    });
  }

  await step('feeds', async () => {
    documentsDeleted += await deleteCollection(deps, `feeds/${uid}/items`);
    await deps.db.collection('feeds').doc(uid).delete();
  });

  await step('keyed-documents', async () => {
    for (const collection of USER_KEYED_DOCUMENTS) {
      await deps.db.collection(collection).doc(uid).delete();
      documentsDeleted += 1;
    }
  });

  /**
   * Reports are anonymised rather than deleted.
   *
   * A report is a record about *content*, and the team may still be acting on
   * it. Removing the reporter's identity from it satisfies the reader's right
   * to be forgotten without destroying a moderation trail — and the reporter is
   * the only personal thing in it.
   */
  await step('reports', async () => {
    const snapshot = await deps.db.collection('reports').where('uid', '==', uid).get();
    await Promise.all(
      snapshot.docs.map((document) =>
        document.ref.set({ uid: 'deleted', anonymisedAt: deps.now().toISOString() }, { merge: true })
      )
    );
  });

  await step('storage', async () => {
    objectsDeleted += await deps.deleteObjects(`users/${uid}/`);
    objectsDeleted += await deps.deleteObjects(`quarantine/users/${uid}/`);
  });

  await step('user-document', async () => {
    await deps.db.collection('users').doc(uid).delete();
    documentsDeleted += 1;
  });

  // Last, and deliberately: while the Auth record exists the reader can sign in
  // and retry. Removing it first would strand a half-deleted account with no
  // way to finish the job.
  await step('auth', async () => {
    await deps.deleteAuthUser(uid);
  });

  await jobRef.set(
    {
      state: 'done' satisfies DeletionState,
      completed: [...completed],
      finishedAt: deps.now().toISOString(),
    },
    { merge: true }
  );

  return { uid, state: 'done', completed: [...completed], documentsDeleted, objectsDeleted };
}
