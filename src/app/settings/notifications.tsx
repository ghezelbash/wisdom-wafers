import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { useTheme } from '@/hooks/use-theme';
import { localizeDigits } from '@/lib/format';
import {
  cancelDailyReminder,
  getPermissionState,
  requestPermission,
  scheduleDailyReminder,
  type PermissionState,
} from '@/platform/notifications';

const TIMES = ['08:00', '14:00', '21:00'];

/**
 * Notification settings.
 *
 * The frequency cap is content, not fine print, and the OS-level case is
 * handled here rather than hidden: if permission is off, the screen spells out
 * the path and states that the rest of the app works without it.
 */
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session, update } = useSession();
  const [permission, setPermission] = useState<PermissionState>('undetermined');

  useEffect(() => {
    getPermissionState().then(setPermission);
  }, []);

  // The app cannot change an OS-level denial; it can only say so and keep
  // working without it.
  const osDenied = permission === 'denied';

  const reschedule = async (enabled: boolean, time: string) => {
    if (!enabled) {
      await cancelDailyReminder();
      update({ notificationsEnabled: false });
      return;
    }

    const state = permission === 'granted' ? permission : await requestPermission();
    setPermission(state);

    if (state === 'denied') {
      update({ notificationsEnabled: false });
      return;
    }

    await scheduleDailyReminder(time, { title: t('reminder.title'), body: t('reminder.body') });
    update({ notificationsEnabled: true, reminderTime: time });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5" style={{ height: 56 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          className="items-center justify-center"
          style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
          <Icon name="chevronBack" size={20} />
        </Pressable>
        <Text variant="label" className="min-w-0 flex-1">
          {t('notifySettings.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        {osDenied ? (
          <View className="mb-5 rounded-card border border-hairline bg-sun-tint p-4">
            <Text variant="bodySm" weight="bold" className="mb-2">
              {t('notifySettings.deniedTitle')}
            </Text>
            <Text variant="bodySm" color="secondary" className="mb-3">
              {t('notifySettings.deniedBody')}
            </Text>
            <Text variant="caption" color="secondary" className="mb-3">
              {t('notifySettings.deniedPath')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openSettings()}
              style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
              <Text variant="bodySm" weight="bold" color="brand">
                {t('notifySettings.openSettings')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mb-5 overflow-hidden rounded-card border border-hairline bg-card">
          <View
            className="flex-row items-center gap-3 p-4"
            style={{ minHeight: MinTouchTarget + 8 }}>
            <View className="min-w-0 flex-1">
              <Text variant="bodySm">{t('notifySettings.reminder')}</Text>
              {/* The cap is stated as content. */}
              <Text variant="caption" color="secondary">
                {t('notifySettings.cap')}
              </Text>
            </View>
            {/* A switch is drawn 40×20 wherever it appears, so the box around
                it carries the target — and it has to be pressable itself, or
                the extra area looks tappable and does nothing. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: session.notificationsEnabled }}
              accessibilityLabel={t('notifySettings.toggle')}
              onPress={() =>
                void reschedule(!session.notificationsEnabled, session.reminderTime ?? '21:00')
              }
              className="items-center justify-center"
              style={{ minWidth: MinTouchTarget, minHeight: MinTouchTarget }}>
              <Switch
                value={session.notificationsEnabled}
                onValueChange={(value) =>
                  void reschedule(value, session.reminderTime ?? '21:00')
                }
                trackColor={{ false: theme.borderStrong, true: theme.brand }}
                thumbColor={theme.card}
              />
            </Pressable>
          </View>
        </View>

        {session.notificationsEnabled ? (
          <>
            <Text variant="caption" weight="bold" color="secondary" className="mb-3 px-1">
              {t('notify.timeLabel')}
            </Text>
            <View className="flex-row gap-[9px]">
              {TIMES.map((value) => {
                const selected = (session.reminderTime ?? '21:00') === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => void reschedule(true, value)}
                    className={`min-h-[48px] flex-1 items-center justify-center rounded-input border-[1.5px] ${
                      selected ? 'border-brand bg-brand-tint' : 'border-hairline bg-card'
                    }`}>
                    <Text variant="bodySm" weight={selected ? 'bold' : 'semibold'}>
                      {localizeDigits(value, i18n.language)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
