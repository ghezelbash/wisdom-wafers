import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { useIdentity } from '@/context/AuthContext';
import { useSession } from '@/context/SessionContext';
import { localizeDigits } from '@/lib/format';
import { requestPermission, scheduleDailyReminder } from '@/platform/notifications';

const TIMES = ['08:00', '14:00', '21:00'];

/**
 * The notification ask.
 *
 * It comes after the first completion — after the value, never before it — and
 * states the frequency cap before requesting anything. «الان نه» is a real,
 * equally sized option, not a greyed-out afterthought.
 */
export default function NotificationAskScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, update } = useSession();
  const { isGuest } = useIdentity();
  const [time, setTime] = useState(session.reminderTime ?? '21:00');

  const finish = async (enabled: boolean) => {
    if (!enabled) {
      update({ notificationsAsked: true, notificationsEnabled: false, reminderTime: null });
    } else {
      // The OS prompt comes after the explanation above, never before it.
      const state = await requestPermission();
      const granted = state === 'granted' || state === 'unsupported';

      if (granted) {
        await scheduleDailyReminder(time, {
          title: t('reminder.title'),
          body: t('reminder.body'),
        });
      }

      update({
        notificationsAsked: true,
        notificationsEnabled: granted,
        reminderTime: granted ? time : null,
      });
    }

    router.back();
    // The account offer follows, once, and only for a guest.
    if (isGuest && !session.accountOfferSeen) {
      setTimeout(() => router.push('/account-offer'), 250);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6">
        <View className="mb-6 h-14 w-14 items-center justify-center rounded-card bg-brand-tint">
          <Icon name="clock" size={26} color="brand" />
        </View>

        <Text variant="titleLg" className="mb-3">
          {t('notify.title')}
        </Text>
        <Text variant="body" color="secondary" className="mb-8">
          {t('notify.body')}
        </Text>

        <Text variant="caption" weight="bold" color="secondary" className="mb-3">
          {t('notify.timeLabel')}
        </Text>
        <View className="flex-row gap-[9px]">
          {TIMES.map((value) => {
            const selected = time === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setTime(value)}
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
      </View>

      <View className="px-6 pb-8">
        <Button label={t('notify.accept')} onPress={() => void finish(true)} className="mb-2" />
        {/* Declining is an equally sized, equally reachable choice. */}
        <Button
          variant="secondary"
          size="lg"
          label={t('notify.decline')}
          onPress={() => void finish(false)}
        />
      </View>
    </SafeAreaView>
  );
}
