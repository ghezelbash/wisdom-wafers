import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
