import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/**
 * Reduce Motion, read at mount and re-read when the app comes back to the
 * foreground — someone can turn it on in Settings while the app is open.
 *
 * Every entry in the motion spec has a real alternative: a cross-fade or an
 * instant swap, never the same animation played faster.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (!cancelled) setReduced(value);
        })
        .catch(() => {
          // Treat an unavailable API as "no preference expressed".
        });
    };

    read();

    const change = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    return () => {
      cancelled = true;
      change.remove();
      appState.remove();
    };
  }, []);

  return reduced;
}
