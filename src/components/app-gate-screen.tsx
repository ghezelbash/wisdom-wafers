import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SystemState } from '@/components/system-state';
import type { GateState } from '@/platform/app-gate';
import { appVersion } from '@/platform/app-info';

/**
 * Maintenance, and a build that is too old.
 *
 * The handoff wrote this copy and nothing could ever trigger it, because both
 * states need a backend to declare them. Drawn with `SystemState` like every
 * other failure, so each one names what still works and offers a second action
 * that is not "retry" — a reader who can only press retry is stuck.
 *
 * Downloaded seeds keep working in both states, which is why the garden is the
 * offer rather than a dead end.
 */
export function AppGateScreen({
  gate,
  onRecheck,
  onOpenGarden,
}: {
  gate: Exclude<GateState, { state: 'open' }>;
  onRecheck: () => void;
  onOpenGarden: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      {gate.state === 'maintenance' ? (
        <SystemState
          icon="info"
          title={t('maintenance.title')}
          body={gate.message ?? t('maintenance.body')}
          facts={gate.until ? [{ label: t('maintenance.untilLabel'), value: gate.until }] : undefined}
          primary={{ label: t('maintenance.goToGarden'), onPress: onOpenGarden }}
          secondary={{ label: t('maintenance.retry'), onPress: onRecheck }}
        />
      ) : (
        <SystemState
          icon="alert"
          title={t('updateRequired.title')}
          body={t('updateRequired.body')}
          facts={[
            { label: t('updateRequired.currentLabel'), value: appVersion(), mono: true },
            { label: t('updateRequired.minimumLabel'), value: gate.minimumVersion, mono: true },
          ]}
          primary={{ label: t('updateRequired.cta'), onPress: onRecheck }}
          secondary={{ label: t('maintenance.goToGarden'), onPress: onOpenGarden }}
        />
      )}
      <View className="h-6" />
    </SafeAreaView>
  );
}
