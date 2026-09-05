import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import type { AccountPreferences } from '@/domain/account/sync';

export type Pace = 'one' | 'two' | 'whenever';
export type TimeOfDay = 'morning' | 'evening' | 'night';

/**
 * Everything the app knows about a reader before — or without — an account.
 *
 * There is no login wall: a guest gets the whole product, and this state is
 * what an account later carries over rather than replaces.
 */
export interface GuestSession {
  onboarded: boolean;
  interests: string[];
  pace: Pace | null;
  timeOfDay: TimeOfDay | null;
  /** The notification ask comes after the first completed seed, once. */
  notificationsAsked: boolean;
  notificationsEnabled: boolean;
  /** 24h «HH:MM», the cap being at most one reminder a day. */
  reminderTime: string | null;
  /** The account offer is made once after a completion; Profile keeps it available. */
  accountOfferSeen: boolean;
  /**
   * When the reader first opened the app, as an ISO instant.
   *
   * Stored rather than held in memory because onboarding survives a restart:
   * a duration measured from a module-level variable would report a few
   * seconds for a reader who came back the next morning. Null for a session
   * that predates this field.
   */
  onboardingStartedAt: string | null;
  /**
   * When these settings were last decided, on any device.
   *
   * The timestamp the whole-object last-write-wins policy compares (ADR 19).
   * Without it a restore had nothing to weigh the account's copy against and
   * could only overwrite or ignore — both wrong half the time. Null for a
   * session that predates the field, which loses to any remote copy, correctly:
   * a device that has never said when it decided cannot claim to be newer.
   */
  preferencesUpdatedAt: string | null;
}

const EMPTY_SESSION: GuestSession = {
  onboarded: false,
  interests: [],
  pace: null,
  timeOfDay: null,
  notificationsAsked: false,
  notificationsEnabled: false,
  reminderTime: null,
  accountOfferSeen: false,
  onboardingStartedAt: null,
  preferencesUpdatedAt: null,
};

const STORAGE_KEY = 'dananeh.session.v1';

interface SessionContextValue {
  session: GuestSession;
  /** False until the stored session has been read — routing waits on this. */
  isReady: boolean;
  update: (patch: Partial<GuestSession>) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Who to push preferences for.
 *
 * A module-level ref rather than a hook dependency: `SessionProvider` sits
 * above `AuthProvider` in the tree, so it cannot call `useIdentity`. Identity
 * sets this whenever it changes, and a session change reads whatever is
 * current — which is exactly the semantics wanted, because a push under a uid
 * that has since changed would strand the data.
 */
const identityRef = { current: { uid: null as string | null, isAccount: false } };

/**
 * How the account's settings get back into the session.
 *
 * The same shape, and the same reason, as `identityRef`: `SessionProvider` sits
 * above `AuthProvider`, so the restore that runs on sign-in cannot reach in
 * with a hook. It registers a function here instead, and the provider is the
 * only thing that ever sets it.
 */
const applyRef = {
  current: null as ((patch: Partial<GuestSession>) => void) | null,
};

/**
 * Applies the account's settings to this device's session.
 *
 * Returns whether anything was applied, so a caller can tell a real restore
 * from one that ran before the provider mounted.
 */
export function applyAccountPreferences(patch: Partial<GuestSession>): boolean {
  if (!applyRef.current) return false;
  applyRef.current(patch);
  return true;
}

/** What the account should be told this device currently wants. */
export function readSessionForSync(): GuestSession | null {
  return sessionRef.current;
}

const sessionRef = { current: null as GuestSession | null };

export function setSessionSyncIdentity(uid: string | null, isAccount: boolean) {
  identityRef.current = { uid, isAccount };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<GuestSession>(EMPTY_SESSION);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          setSession({ ...EMPTY_SESSION, ...(JSON.parse(raw) as Partial<GuestSession>) });
        }
      } catch {
        // Unreadable or corrupt storage means a first launch, not a crash.
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: GuestSession) => {
    setSession(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // Losing the write costs the reader one repeat of onboarding, not data.
    });
  }, []);

  const update = useCallback(
    (patch: Partial<GuestSession>) => {
      setSession((current) => {
        const next = { ...current, ...patch };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const completeOnboarding = useCallback(() => update({ onboarded: true }), [update]);

  // The bridges the restore uses. Registered here because this provider is
  // above the one that signs a reader in, and cleared on unmount so a stale
  // closure cannot write into a session that no longer exists.
  useEffect(() => {
    applyRef.current = update;
    return () => {
      applyRef.current = null;
    };
  }, [update]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * The reader's choices, queued for their account.
   *
   * Local first, always: the write above has already happened, so the reader's
   * choice is never waiting on a network. What changed is what happens next.
   *
   * This used to call Firestore directly and report a failure to the crash
   * sink — so a pace chosen on a train was simply never sent, and nothing could
   * tell afterwards that it had been lost. It now goes into the outbox, which
   * survives a force-stop, retries with backoff, and rewrites the owner if the
   * guest links an account.
   *
   * Debounced, because onboarding sets interests one tap at a time and the
   * account only needs the answer. The debounce is safe to lose: it is queued
   * by a deterministic id, so the *next* change re-queues the whole current
   * state — and `flushPending` below covers the one case where there is no
   * next change.
   */
  const pending = useRef<GuestSession | null>(null);
  const lastQueued = useRef<AccountPreferences | null>(null);

  const queueCurrent = useCallback(
    async (value: GuestSession) => {
      try {
        const [{ queuePreferences }, preferences, i18n] = await Promise.all([
          import('@/domain/account/intents'),
          import('@/domain/account/preferences'),
          import('@/i18n'),
        ]);

        const next = preferences.preferencesFromSession(
          value,
          i18n.default.language === 'en' ? 'en' : 'fa-IR',
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        );

        // Nothing a second device would notice has changed. Without this the
        // stamp written below would retrigger this effect forever.
        if (lastQueued.current && !preferences.preferencesChanged(lastQueued.current, next)) {
          pending.current = null;
          return;
        }

        const queued = await queuePreferences(
          { uid: identityRef.current.uid, isAccount: identityRef.current.isAccount },
          next
        );

        lastQueued.current = next;
        pending.current = null;

        // The moment this state was decided, kept so the next restore can weigh
        // it against the account's copy without asking the network.
        if (queued) update({ preferencesUpdatedAt: next.updatedAt });
      } catch {
        // The local write already happened; the next change re-queues this state.
      }
    },
    [update]
  );

  useEffect(() => {
    if (!isReady || !session.onboarded) return;

    pending.current = session;
    const timer = setTimeout(() => void queueCurrent(session), 1500);

    return () => clearTimeout(timer);
  }, [session, isReady, queueCurrent]);

  /**
   * The debounce that never fires.
   *
   * A reader who changes a setting and immediately backgrounds the app, signs
   * out, or closes it would otherwise lose that last change — the timer is
   * cleared on unmount and nothing else knows about it. Both paths flush.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && pending.current) void queueCurrent(pending.current);
    });
    return () => {
      subscription.remove();
      if (pending.current) void queueCurrent(pending.current);
    };
  }, [queueCurrent]);

  const reset = useCallback(() => persist(EMPTY_SESSION), [persist]);

  const value = useMemo(
    () => ({ session, isReady, update, completeOnboarding, reset }),
    [session, isReady, update, completeOnboarding, reset]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}
