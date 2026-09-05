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
import { setSessionSyncIdentity } from '@/context/SessionContext';
import { track } from '@/platform/analytics';
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
  /**
   * True when work created under a previous uid has not been handed over yet.
   *
   * The reader is signed in and nothing is lost — the handover is recorded and
   * retried — but until it finishes, what they did as a guest is still
   * addressed to the old owner.
   */
  hasPendingMigration: boolean;
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
  /**
   * Proves the account holder is present, without sending them away to sign
   * out and back in.
   */
  reauthenticate: (password: string) => Promise<void>;
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
  const [hasPendingMigration, setHasPendingMigration] = useState(false);

  const networkState = Network.useNetworkState();
  const isOnline = networkState.isInternetReachable ?? networkState.isConnected ?? true;

  const apply = useCallback((next: Identity | null) => {
    identityRef.current = next;
    setIdentity(next);
    // `SessionProvider` sits above this one and cannot call `useIdentity`, so
    // the target for preference sync is handed down rather than read up.
    setSessionSyncIdentity(next?.uid ?? null, next?.source === 'account');
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
   * Hands work from one uid to another, and records it if that fails.
   *
   * The reader is signed in either way — refusing to sign them in because a
   * background handover failed would be worse than the problem. What must not
   * happen is the failure disappearing: it is written down, surfaced as
   * `hasPendingMigration`, and retried.
   */
  const runMigration = useCallback(
    async (from: string, to: string, announce: boolean): Promise<boolean> => {
      const [{ migrateIdentity: migrate }, pending] = await Promise.all([
        import('@/domain/identity/migration'),
        import('@/data/local/pending-migration'),
      ]);

      try {
        await migrate(from, to, { announce });
        await pending.clearPendingMigration();
        setHasPendingMigration(false);
        return true;
      } catch (error) {
        await pending.recordPendingMigration({ from, to, announce }, error);
        setHasPendingMigration(true);
        return false;
      }
    },
    []
  );

  /** Finishes anything a previous session could not. */
  const retryPendingMigration = useCallback(async () => {
    const { readPendingMigration } = await import('@/data/local/pending-migration');
    const pending = await readPendingMigration();
    if (!pending) return;

    // Only meaningful while the reader is still the owner it was handed to.
    if (identityRef.current?.uid !== pending.to) {
      setHasPendingMigration(true);
      return;
    }
    await runMigration(pending.from, pending.to, pending.announce);
  }, [runMigration]);

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
          await runMigration(previous, next.uid, false);
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
  }, [apply, isLocalOnly, runMigration]);

  // A connection appearing is the signal to try again.
  useEffect(() => {
    if (!isReady || !isOnline || !isLocalOnly) return;
    void recoverFromLocalOnly();
  }, [isReady, isOnline, isLocalOnly, recoverFromLocalOnly]);

  // An unfinished handover is retried on the same signal, and once at startup.
  useEffect(() => {
    if (!isReady || !isOnline) return;
    void retryPendingMigration();
  }, [isReady, isOnline, identity?.uid, retryPendingMigration]);

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

      const kept = !previous || previous === next.uid;

      if (!kept) {
        // Only reachable when there was no anonymous session to link, so this
        // really is a new owner and the account has never been told what this
        // device holds.
        await runMigration(previous, next.uid, true);
      }

      // `anonymous` means the uid survived — the link worked, and the guest's
      // record is still theirs. `local` means it did not, which is the case
      // worth being able to count.
      track('account_linked', { from: kept ? 'anonymous' : 'local' });
      apply(next);
    },
    [apply, credentialRepository, runMigration]
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
        // A bookmark's timestamp is the progress row's: it is the last time
        // anything about that seed changed on this device, which is the best
        // statement available about when the bookmark was decided.
        readLocalSaved: async () =>
          (await progressStore.listProgress()).map((item) => ({
            seedId: item.seedId,
            saved: !!item.saved,
            updatedAt: item.updatedAt,
          })),
        // Queued, not written: a restore that runs on a bad connection must not
        // lose the device's own newer state.
        pushSaved: async (entries) => {
          const { queueSaved } = await import('@/domain/account/intents');
          for (const entry of entries) {
            await queueSaved({ uid, isAccount: true }, entry);
          }
        },

        /**
         * The half that did not exist.
         *
         * `pull` returned the account's settings and `mergePreferences` knew
         * what to do with them, and nothing called either — so signing in on a
         * second phone restored the garden and then showed the default pace and
         * no interests.
         */
        readLocalPreferences: async () => {
          const [{ readSessionForSync }, { preferencesFromSession }, i18n] = await Promise.all([
            import('@/context/SessionContext'),
            import('@/domain/account/preferences'),
            import('@/i18n'),
          ]);

          const current = readSessionForSync();
          if (!current || !current.onboarded) return null;

          return preferencesFromSession(
            current,
            i18n.default.language === 'en' ? 'en' : 'fa-IR',
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            current.preferencesUpdatedAt ?? new Date(0).toISOString()
          );
        },
        applyPreferences: async (preferences) => {
          const [{ applyAccountPreferences, readSessionForSync }, { sessionFromPreferences }] =
            await Promise.all([
              import('@/context/SessionContext'),
              import('@/domain/account/preferences'),
            ]);

          const current = readSessionForSync();
          if (!current) return;

          applyAccountPreferences({
            ...sessionFromPreferences(preferences, current),
            // Kept so the next restore can tell which side is newer without
            // asking the network again.
            preferencesUpdatedAt: preferences.updatedAt,
          });
        },
        pushPreferences: async (preferences) => {
          const { queuePreferences } = await import('@/domain/account/intents');
          await queuePreferences({ uid, isAccount: true }, preferences);
        },
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
        await runMigration(previous, next.uid, true);
      }
      apply(next);

      // And the other direction: what the account already knows comes down, so
      // a second device shows the reader's garden rather than an empty one.
      await restoreFromAccount(next.uid);
    },
    [apply, credentialRepository, restoreFromAccount, runMigration]
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
  /**
   * A fresh reader after a deletion, whatever the network is doing.
   *
   * Anonymous sign-in can fail — and right after a deletion is a likely moment
   * for it to, because the request that just succeeded may have been the last
   * one to get through. Falling back to a device-local identity keeps the app
   * usable, and `recoverFromLocalOnly` upgrades it when a connection returns.
   */
  const startFreshIdentity = useCallback(async () => {
    const next = remoteRepository
      ? await remoteRepository.ensureSignedIn().catch(() => null)
      : null;

    if (next) {
      setIsLocalOnly(false);
      apply(next);
      return;
    }

    setIsLocalOnly(true);
    apply(await localRepository.ensureSignedIn().catch(() => null));
  }, [apply]);

  const deletionPorts = useCallback(async (uid: string) => {
    const [remote, { wipeDevice }, receipts] = await Promise.all([
      import('@/data/remote/account-deletion'),
      import('@/data/local/device-wipe'),
      import('@/data/local/deletion-receipt'),
    ]);

    return {
      uid,
      beginServerDeletion: remote.beginServerDeletion,
      storeReceipt: (receipt: string) =>
        receipts.storeDeletionReceipt({ uid, receipt, requestedAt: new Date().toISOString() }),
      clearReceipt: receipts.clearDeletionReceipt,
      requestServerDeletion: remote.requestServerDeletion,
      resumeServerDeletion: remote.resumeServerDeletion,
      serverDeletionStatus: remote.serverDeletionStatus,
      wipeDevice: async () => {
        await wipeDevice();
      },
      startFreshIdentity,
    };
  }, [startFreshIdentity]);

  const deleteAccount = useCallback(async () => {
    const uid = identityRef.current?.uid;
    if (!uid) throw new Error('no-identity');

    const { deleteAccountEverywhere } = await import('@/domain/account/delete');
    await deleteAccountEverywhere(await deletionPorts(uid));
  }, [deletionPorts]);

  const reauthenticate = useCallback(
    async (password: string) => {
      const repository = await credentialRepository();
      await repository.reauthenticate(password);
    },
    [credentialRepository]
  );

  /**
   * Finishes a deletion a previous session could not.
   *
   * A receipt still on the device means either the response was lost or the app
   * was killed between the server finishing and the wipe. Both leave a reader
   * who asked for deletion still holding their data.
   */
  useEffect(() => {
    if (!isReady || !isOnline) return;

    void (async () => {
      const { readDeletionReceipt } = await import('@/data/local/deletion-receipt');
      const pending = await readDeletionReceipt();
      if (!pending) return;

      const { resumeInterruptedDeletion } = await import('@/domain/account/delete');
      await resumeInterruptedDeletion(
        await deletionPorts(pending.uid),
        pending.receipt
      ).catch(() => false);
    })();
  }, [isReady, isOnline, deletionPorts]);

  const value = useMemo(
    () => ({
      identity,
      isReady,
      isGuest: identityIsGuest(identity),
      isLocalOnly,
      hasPendingMigration,
      createAccount,
      signIn,
      signOut,
      sendPasswordReset,
      recoverFromLocalOnly,
      deleteAccount,
      reauthenticate,
    }),
    [
      identity,
      isReady,
      isLocalOnly,
      hasPendingMigration,
      createAccount,
      signIn,
      signOut,
      sendPasswordReset,
      recoverFromLocalOnly,
      deleteAccount,
      reauthenticate,
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
