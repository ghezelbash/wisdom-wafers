import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SystemState } from '@/components/system-state';
import { useRemoteConfig } from '@/context/RemoteConfigContext';
import type { FeatureFlags } from '@/platform/config';

/**
 * A screen that only exists while its feature is on.
 *
 * Hiding the button that leads here is not enough: a deep link, a notification
 * scheduled before the switch was thrown, or navigation state restored from a
 * previous launch all arrive without passing the button. The screen has to
 * refuse for itself.
 *
 * It waits for the first config fetch to settle before deciding, so a screen
 * opened at launch does not flash "unavailable" and then work.
 */
export function FeatureGate({
  flag,
  children,
}: {
  flag: keyof FeatureFlags;
  children: React.ReactNode;
}) {
  const { flags, isReady } = useRemoteConfig();
  const router = useRouter();
  const { t } = useTranslation();

  const enabled = flags[flag] === true;

  // Also covers the flag flipping while the screen is already open.
  useEffect(() => {
    if (isReady && !enabled && !router.canGoBack()) router.replace('/(tabs)');
  }, [isReady, enabled, router]);

  if (!isReady || enabled) return <>{children}</>;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <SystemState
        icon="info"
        title={t('featureOff.title')}
        body={t('featureOff.body')}
        primary={{
          label: t('featureOff.back'),
          onPress: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)')),
        }}
      />
    </SafeAreaView>
  );
}
