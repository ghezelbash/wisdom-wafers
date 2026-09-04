import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { OnboardingHeader } from '@/components/onboarding-header';
import { Text } from '@/components/Text';
import { useSession, type Pace, type TimeOfDay } from '@/context/SessionContext';
import { useTheme } from '@/hooks/use-theme';

const PACES: { id: Pace; recommended?: boolean }[] = [
  { id: 'one' },
  { id: 'two', recommended: true },
  { id: 'whenever' },
];

const TIMES: TimeOfDay[] = ['morning', 'evening', 'night'];

/** 3 · Pace — sets the daily goal only. No permission ask here; the
 *  notification prompt comes after the first completed seed. */
export default function PaceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, update } = useSession();
  const [pace, setPace] = useState<Pace>(session.pace ?? 'two');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(session.timeOfDay ?? 'evening');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <OnboardingHeader step={3} />

      <ScrollView className="min-w-0 flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 30 }}>
        <Text variant="titleLg" className="mb-2">
          {t('onboarding.pace.title')}
        </Text>
        <Text variant="bodySm" color="secondary" className="mb-6">
          {t('onboarding.pace.subtitle')}
        </Text>

        <View className="mb-8 gap-3">
          {PACES.map(({ id, recommended }) => {
            const isSelected = pace === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setPace(id)}
                className={`flex-row items-center gap-[14px] rounded-[20px] border-[1.5px] bg-card p-[18px] ${
                  isSelected ? 'border-brand' : 'border-hairline'
                }`}>
                <View
                  className="h-[22px] w-[22px] items-center justify-center rounded-full border-[1.75px]"
                  style={{ borderColor: isSelected ? theme.brand : theme.borderStrong }}>
                  {isSelected ? (
                    <View
                      className="h-[11px] w-[11px] rounded-full"
                      style={{ backgroundColor: theme.brand }}
                    />
                  ) : null}
                </View>

                <View className="min-w-0 flex-1">
                  <Text variant="bodySm" weight="bold">
                    {t(`onboarding.pace.${id}`)}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {t(`onboarding.pace.${id}Meta`)}
                  </Text>
                </View>

                {recommended ? (
                  <View className="rounded-chip bg-sun-tint px-[9px] py-[5px]">
                    <Text variant="caption" weight="bold" color="sun">
                      {t('onboarding.pace.recommended')}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" weight="bold" color="secondary" className="mb-3">
          {t('onboarding.pace.timeQuestion')}
        </Text>
        <View className="flex-row gap-[9px]">
          {TIMES.map((time) => {
            const isSelected = timeOfDay === time;
            return (
              <Pressable
                key={time}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setTimeOfDay(isSelected ? null : time)}
                className={`min-h-[48px] flex-1 items-center justify-center rounded-input border-[1.5px] ${
                  isSelected ? 'border-ink bg-ink' : 'border-hairline bg-card'
                }`}>
                <Text
                  variant="bodySm"
                  weight={isSelected ? 'bold' : 'semibold'}
                  style={isSelected ? { color: theme.canvas } : undefined}>
                  {t(`onboarding.pace.${time}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <Button
          label={t('common.continue')}
          onPress={() => {
            update({ pace, timeOfDay });
            router.push('/onboarding/first-seed');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
