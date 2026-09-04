import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** Nothing to subscribe to: hydration is the only transition here. */
const noopSubscribe = () => () => {};

/**
 * The static render has no client colour scheme, so the first paint must be
 * deterministic — `useSyncExternalStore` gives the server snapshot `false` and
 * the client snapshot `true` without a setState during an effect.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
