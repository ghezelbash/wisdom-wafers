import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { routeFromNotificationData } from '@/platform/deep-links';

/**
 * Opens whatever a notification pointed at.
 *
 * Two entry points matter: a tap while the app is running, and a tap that
 * launched it — the second is the one usually missed, and it is the common case
 * for a daily reminder.
 */
export function useNotificationRouting(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    (async () => {
      const notifications = await import('expo-notifications');

      const open = (data: unknown) => {
        // A notification payload is untrusted input. The target is matched
        // against an allow-list of routes that exist — a slash test would
        // accept `//evil.example/x`, which several link handlers read as an
        // absolute URL.
        const route = routeFromNotificationData(data);
        if (route) router.push(route as never);
      };

      // A tap that launched the app: the response is waiting, not emitted.
      const initial = await notifications.getLastNotificationResponseAsync();
      if (!cancelled && initial) {
        open(initial.notification.request.content.data);
      }

      subscription = notifications.addNotificationResponseReceivedListener((response) =>
        open(response.notification.request.content.data)
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, router]);
}
