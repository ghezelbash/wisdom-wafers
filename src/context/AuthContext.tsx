import * as Network from 'expo-network';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { FirebaseIdentityRepository } from '@/data/repositories/firebase-identity-repository';
import { LocalIdentityRepository } from '@/data/repositories/local-identity-repository';
import { isFirebaseConfigured } from '@/data/remote/firebase-app';
import { migrateIdentity } from '@/domain/identity/migration';
import {
  AuthError,
  isGuest as identityIsGuest,
  isLocalUid,
  type Identity,
  type IdentityRepository,
} from '@/domain/identity/types';

interface IdentityContextValue {
  identity: Identity | null;
  /** False until the first identity resolution finishes. */
  isReady: boolean;
  /** True for anonymous and local readers — everyone without an account. */
  isGuest: boolean;
  /** True when sync is unavailable and the reader is on a device-only uid. */
  isLocalOnly: boolean;
  createAccount: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /**
   * Tries to leave the device-only identity behind. Returns whether the reader
   * is now on a real one; safe to call at any time.
   */
  recoverFromLocalOnly: () => Promise<boolean>;
  /**
   * Erases the account everywhere, then starts over as a fresh guest.
   *
   * Throws `AccountDeletionError` if the server did not finish — in which case
   * nothing on the device has been touched.
   */
  deleteAccount: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

// Stateless services, constructed once for the process rather than per render.
// Neither constructor touches the network; Firebase is reached lazily.
const localRepository = new LocalIdentityRepository();
const remoteRepository = isFirebaseConfigured ? new FirebaseIdentityRepository() : null;

/**
 * Identity for the whole app.
 *
 * A reader is signed in anonymously before they see anything, so their first
 * seed already belongs to a stable uid. If that cannot happen — no Firebase
 * configuration, no network, anonymous sign-in disabled — the app falls back to
 * a device-local identity rather than blocking: guest-first is not conditional
 * on a backend being reachable.
 *
 * That fallback used to be permanent. A single failed sign-in at launch pinned
 * the app to the local repository until it was killed and restarted, so every
 * later sign-in attempt failed with a network error even once the connection
 * was back. It is now a state the app climbs out of: on reconnect, and before
 * any credential action, it tries the real backend again and migrates the
 * device-local uid onto the one Firebase issues.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState(!isFirebaseConfigured);
  const identityRef = useRef<Identity | null>(null);
  const recovering = useRef<Promise<boolean> | null>(null);

  const networkState = Network.useNetworkState();
  const isOnline = networkState.isInternetReachable ?? networkState.isConnected ?? true;

  const apply = useCallback((next: Identity | null) => {
    identityRef.current = next;
    setIdentity(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const repository: IdentityRepository = remoteRepository ?? localRepository;

    const unsubscribe = repository.observe((next) => {
      // The local repository has no session of its own to report; ignore its
      // null so a recovered identity is not wiped by an unrelated emission.
      if (!cancelled && next) apply(next);
    });

    repository
      .ensureSignedIn()
      .then((next) => {
        if (!cancelled) {
          apply(next);
          setIsLocalOnly(false);
        }
      })
      .catch(async () => {
        // Anonymous sign-in can fail for reasons the reader cannot act on.
        // Degrade to a local uid and carry on — and remember that this is a
        // degraded state, not the destination.
        if (cancelled) return;
        const fallback = await localRepository.ensureSignedIn();
        if (!cancelled) {
          setIsLocalOnly(true);
          apply(fallback);
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apply]);

  /**
   * Climbs out of the device-only identity.
   *
   * The queue moves with the reader: envelopes built under the `local-…` uid
   * are rewritten to the one Firebase issued, including any that already
   * dead-lettered as a uid mismatch.
   */
  const recoverFromLocalOnly = useCallback(async (): Promise<boolean> => {
    if (!remoteRepository) return false;
    if (!isLocalOnly) return true;
    // Concurrent callers — a reconnect and a tapped sign-in — share one attempt.
    if (recovering.current) return recovering.current;

    const attempt = (async () => {
      try {
        const previous = identityRef.current?.uid ?? null;
        const next = await remoteRepository.ensureSignedIn();

        // Recovery, not a change of owner: the queue already holds everything
        // the server has not seen, so nothing is re-announced.
        if (previous && isLocalUid(previous)) {
          await migrateIdentity(previous, next.uid).catch(() => undefined);
        }

        setIsLocalOnly(false);
        apply(next);
        return true;
      } catch {
        return false;
      } finally {
        recovering.current = null;
      }
    })();

    recovering.current = attempt;
    return attempt;
  }, [apply, isLocalOnly]);

  // A connection appearing is the signal to try again.
  useEffect(() => {
    if (!isReady || !isOnline || !isLocalOnly) return;
    void recoverFromLocalOnly();
  }, [isReady, isOnline, isLocalOnly, recoverFromLocalOnly]);

  /**
   * Picks the repository for a credential action.
   *
   * A reader who launched offline must be able to sign in the moment they are
   * online, without restarting the app — so recovery is attempted first, and
   * only a still-unreachable backend falls through to the local repository's
   * honest network error.
   */
  const credentialRepository = useCallback(async (): Promise<IdentityRepository> => {
    if (remoteRepository && (!isLocalOnly || (await recoverFromLocalOnly()))) {
      return remoteRepository;
    }
    return localRepository;
  }, [isLocalOnly, recoverFromLocalOnly]);

  const createAccount = useCallback(
    async (email: string, password: string) => {
      const repository = await credentialRepository();
      const previous = identityRef.current?.uid ?? null;

      // Linking, not creating: the anonymous uid — and everything keyed on it —
      // survives the upgrade, so the uid below is normally the same one.
      const next = await repository.linkEmailPassword(email.trim(), password);

      if (previous && previous !== next.uid) {
        // Only reachable when there was no anonymous session to link, so this
        // really is a new owner and the account has never been told what this
        // device holds.
        await migrateIdentity(previous, next.uid, { announce: true }).catch(() => undefined);
      }
      apply(next);
    },
    [apply, credentialRepository]
  );

  /**
   * Pulls the account's own record onto this device.
   *
   * Merged, never assigned: the device may hold a completion the account has
   * not heard about yet, and an overwrite would erase exactly that.
   */
  const restoreFromAccount = useCallback(async (uid: string) => {
    try {
      const [{ restoreAccount }, { AccountSync }, { getDb }, progressStore] = await Promise.all([
        import('@/domain/account/restore'),
        import('@/data/remote/account-sync'),
        import('@/data/remote/firebase-app'),
        import('@/lib/progress-store'),
      ]);

      const sync = new AccountSync(getDb());

      await restoreAccount(uid, {
        pull: (owner) => sync.pull(owner),
        readLocal: async () =>
          (await progressStore.listProgress()).map((item) => ({
            seedId: item.seedId,
            revision: item.revision,
            blockIndex: item.blockIndex,
            status: item.completedAt ? 'completed' : 'in_progress',
            saved: item.saved,
            completedAt: item.completedAt,
            updatedAt: item.updatedAt,
            reviewedAt: item.reviewedAt,
            reviewInterval: item.reviewInterval,
            reviewCount: item.reviewCount,
          })),
        writeLocal: async (merged) => {
          for (const item of merged) {
            const existing = await progressStore.loadProgress(item.seedId, item.revision);
            await progressStore.saveProgress({
              ...existing,
              seedId: item.seedId,
              revision: item.revision,
              blockIndex: item.blockIndex,
              completedAt: item.completedAt,
              saved: item.saved,
              reviewedAt: item.reviewedAt,
              reviewInterval: item.reviewInterval,
              reviewCount: item.reviewCount,
              updatedAt: item.updatedAt,
            });
          }
        },
        applySaved: async (seedIds) => {
          const bookmarked = new Set(seedIds);
          for (const item of await progressStore.listProgress()) {
            if (!!item.saved === bookmarked.has(item.seedId)) continue;
            await progressStore.saveProgress({ ...item, saved: bookmarked.has(item.seedId) });
          }
        },
      });
    } catch {
      // A restore that could not run costs the reader nothing they had — their
      // device record is untouched, and the next sign-in tries again.
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const repository = await credentialRepository();
      const previous = identityRef.current?.uid ?? null;
      const next = await repository.signIn(email.trim(), password);

      // Signing into an existing account *is* a change of owner: the account
      // has never heard of this device. Queued work is handed over and what is
      // already finished here is announced, with ids derived from the facts so
      // signing in twice cannot count anything twice.
      if (previous && previous !== next.uid) {
        await migrateIdentity(previous, next.uid, { announce: true }).catch(() => undefined);
      }
      apply(next);

      // And the other direction: what the account already knows comes down, so
      // a second device shows the reader's garden rather than an empty one.
      await restoreFromAccount(next.uid);
    },
    [apply, credentialRepository, restoreFromAccount]
  );

  const signOut = useCallback(async () => {
    const repository = remoteRepository && !isLocalOnly ? remoteRepository : localRepository;
    await repository.signOut();
    // Signing out returns the reader to a guest session rather than a wall.
    const next = await repository.ensureSignedIn().catch(() => null);
    apply(next);
  }, [apply, isLocalOnly]);

  const sendPasswordReset = useCallback(
    async (email: string) => (await credentialRepository()).sendPasswordReset(email.trim()),
    [credentialRepository]
  );

  /**
   * Delete account.
   *
   * The order is load-bearing: the server job has to report `done` before a
   * single row on the device is touched. The old screen did the reverse — a
   * local reset and a navigation — which told the reader their data was gone
   * while all of it was still on the server.
   */
  const deleteAccount = useCallback(async () => {
    const [{ deleteAccountEverywhere }, { requestServerDeletion }, { wipeDevice }] =
      await Promise.all([
        import('@/domain/account/delete'),
        import('@/data/remote/account-deletion'),
        import('@/data/local/device-wipe'),
      ]);

    await deleteAccountEverywhere({
      requestServerDeletion,
      wipeDevice: async () => {
        await wipeDevice();
      },
      startFreshIdentity: async () => {
        // Not a signed-out dead end: the reader lands back in the app as a new
        // anonymous one, which is what guest-first means after a deletion too.
        const repository = remoteRepository ?? localRepository;
        apply(await repository.ensureSignedIn().catch(() => null));
      },
    });
  }, [apply]);

  const value = useMemo(
    () => ({
      identity,
      isReady,
      isGuest: identityIsGuest(identity),
      isLocalOnly,
      createAccount,
      signIn,
      signOut,
      sendPasswordReset,
      recoverFromLocalOnly,
      deleteAccount,
    }),
    [
      identity,
      isReady,
      isLocalOnly,
      createAccount,
      signIn,
      signOut,
      sendPasswordReset,
      recoverFromLocalOnly,
      deleteAccount,
    ]
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (!context) throw new Error('useIdentity must be used inside an AuthProvider');
  return context;
}

/** The locale key for an error, so a screen never renders a Firebase code. */
export const authErrorKey = (error: unknown) =>
  `authError.${error instanceof AuthError ? error.code : 'unknown'}`;

/**
 * @deprecated Kept while screens migrate; prefer `useIdentity`.
 * `user` is the account-bearing identity only, matching the old shape's meaning.
 */
export function useAuth() {
  const { identity, isReady } = useIdentity();
  return {
    user: identity && identity.source === 'account' ? { uid: identity.uid, email: identity.email } : null,
    isLoading: !isReady,
  };
}
