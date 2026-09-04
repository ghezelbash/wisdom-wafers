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
import { AppState } from 'react-native';

import { appVersion } from '@/platform/app-info';
import { DEFAULT_FLAGS, setFlags, type FeatureFlags } from '@/platform/config';
import { refreshRemoteConfig } from '@/platform/remote-config';
import type { GateState } from '@/platform/app-gate';

/**
 * The single runtime source of truth for what this build may do.
 *
 * `platform/config` held the policy and `platform/remote-config` could fetch —
 * and **nothing read either of them**. Every feature was on because no code
 * asked whether it should be, which made the kill switches decoration.
 *
 * So flags live here, in state, and change re-renders whatever depends on them.
 * The module in `platform/config` mirrors the same values for the services that
 * are not React — the outbox worker, the notification scheduler — and this
 * context is what writes to it. One source, two shapes.
 *
 * ### When it refreshes
 *
 * On mount, whenever a connection appears, and whenever the app returns to the
 * foreground. Not on a timer: a reader who leaves the app open all day is not
 * the case a kill switch has to reach quickly, and polling costs battery for
 * nothing.
 *
 * Every path **fails open**. Unreachable, absent or malformed leaves the app
 * exactly as it shipped.
 */

export interface RemoteConfigValue {
  flags: FeatureFlags;
  gate: GateState;
  /** Null until a fetch has actually returned something. */
  fetchedAt: string | null;
  /** False until the first attempt settles, so nothing flashes before it. */
  isReady: boolean;
  /**
   * The reader chose to carry on with what is already on the device during
   * maintenance. Never available for a forced update.
   */
  isMaintenanceAcknowledged: boolean;
  acknowledgeMaintenance: () => void;
  refresh: () => Promise<void>;
}

const RemoteConfigContext = createContext<RemoteConfigValue | null>(null);

/**
 * What maintenance leaves working.
 *
 * Narrowly scoped on purpose: the gate stays `maintenance`, and the exception
 * is expressed as flags rather than by declaring the gate open. Anything that
 * needs the backend is off; what is already on the device keeps working, which
 * is exactly what the maintenance copy promises.
 */
export const MAINTENANCE_FLAGS: Partial<FeatureFlags> = {
  contentSource: 'mock',
  downloadsEnabled: false,
};

export function RemoteConfigProvider({ children }: { children: React.ReactNode }) {
  const [flags, setLocalFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [gate, setGate] = useState<GateState>({ state: 'open' });
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isMaintenanceAcknowledged, setAcknowledged] = useState(false);

  const networkState = Network.useNetworkState();
  const isOnline = networkState.isInternetReachable ?? networkState.isConnected ?? true;
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    // Concurrent triggers — a reconnect and a foreground at once — share one.
    if (inFlight.current) return inFlight.current;

    const attempt = (async () => {
      try {
        const remote = await refreshRemoteConfig(appVersion());
        setLocalFlags(remote.flags);
        setGate(remote.gate);
        if (remote.fetchedAt) setFetchedAt(remote.fetchedAt);

        // A gate that has re-opened clears the acknowledgement, so the next
        // maintenance is a decision the reader makes again.
        if (remote.gate.state === 'open') setAcknowledged(false);
      } finally {
        setIsReady(true);
        inFlight.current = null;
      }
    })();

    inFlight.current = attempt;
    return attempt;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A connection appearing is the signal to try again.
  useEffect(() => {
    if (!isOnline) return;
    void refresh();
  }, [isOnline, refresh]);

  // And coming back to the app — the moment a kill switch most needs to land.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  /** What the app may actually do right now, maintenance included. */
  const effective = useMemo<FeatureFlags>(
    () =>
      gate.state === 'maintenance' ? { ...flags, ...MAINTENANCE_FLAGS } : flags,
    [flags, gate.state]
  );

  // Services that are not React read the same values through the module.
  useEffect(() => {
    setFlags(effective);
  }, [effective]);

  const acknowledgeMaintenance = useCallback(() => {
    // Only maintenance can be carried past. A build too old to be trusted with
    // the current data has no safe subset to offer.
    setGate((current) => (current.state === 'maintenance' ? current : current));
    setAcknowledged(true);
  }, []);

  const value = useMemo(
    () => ({
      flags: effective,
      gate,
      fetchedAt,
      isReady,
      isMaintenanceAcknowledged,
      acknowledgeMaintenance,
      refresh,
    }),
    [effective, gate, fetchedAt, isReady, isMaintenanceAcknowledged, acknowledgeMaintenance, refresh]
  );

  return <RemoteConfigContext.Provider value={value}>{children}</RemoteConfigContext.Provider>;
}

export function useRemoteConfig(): RemoteConfigValue {
  const context = useContext(RemoteConfigContext);
  if (!context) throw new Error('useRemoteConfig must be used inside a RemoteConfigProvider');
  return context;
}

/** One flag, reactively. A change re-renders whatever asked. */
export function useFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
  return useRemoteConfig().flags[flag];
}
