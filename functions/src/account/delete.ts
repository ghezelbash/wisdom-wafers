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

export type DeletionState = 'running' | 'done' | 'failed';

export interface DeletionJob {
  uid: string;
  state: DeletionState;
  startedAt: string;
  finishedAt?: string;
  /** Every step that has completed, so a resumed run can skip it. */
  completed: string[];
  error?: string;
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

export async function deleteAccount(
  deps: Deps,
  input: { uid: string; authTimeSeconds?: number }
): Promise<DeleteAccountResult> {
  if (!isRecentLogin(input.authTimeSeconds, deps.now())) {
    throw new DeletionError('requires-recent-login');
  }

  const { uid } = input;
  const jobRef = deps.db.collection('deletionJobs').doc(uid);
  const existing = (await jobRef.get()).data() as DeletionJob | undefined;

  // A resumed run skips what already finished, so retrying after a timeout
  // cannot half-delete anything twice or report a step it did not do.
  const completed = new Set(existing?.state === 'done' ? [] : (existing?.completed ?? []));

  await jobRef.set(
    {
      uid,
      state: 'running' satisfies DeletionState,
      startedAt: existing?.startedAt ?? deps.now().toISOString(),
      completed: [...completed],
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
