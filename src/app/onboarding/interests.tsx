import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { OnboardingHeader } from '@/components/onboarding-header';
import { Text } from '@/components/Text';
import { useSession } from '@/context/SessionContext';
import { INTEREST_TOPICS, MIN_INTERESTS, type Topic } from '@/data/topics';
import { localizeDigits } from '@/lib/format';

/** Selected chips are filled with their topic family's accent. Sun takes an ink
 *  label — as a fill it is only 1.9:1 against canvas, and white on it fails. */
const familyFill: Record<Topic['family'], { surface: string; label: 'onBrand' | 'primary' }> = {
  sciences: { surface: 'bg-brand border-brand', label: 'onBrand' },
  humanities: { surface: 'bg-plum border-plum', label: 'onBrand' },
  practical: { surface: 'bg-sun border-sun', label: 'primary' },
};

/** 2 · Interests — two minimum, and every choice is reversible. */
export default function InterestsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session, update } = useSession();
  const [selected, setSelected] = useState<string[]>(session.interests);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const enough = selected.length >= MIN_INTERESTS;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <OnboardingHeader step={2} />

      <ScrollView className="min-w-0 flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 30 }}>
        <Text variant="titleLg" className="mb-2">
          {t('onboarding.interests.title')}
        </Text>
        <Text variant="bodySm" color="secondary" className="mb-6">
          {t('onboarding.interests.subtitle')}
        </Text>

        <View className="flex-row flex-wrap gap-[10px]">
          {INTEREST_TOPICS.map((topic) => {
            const isSelected = selected.includes(topic.id);
            const fill = familyFill[topic.family];
            return (
              <Pressable
                key={topic.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                onPress={() => toggle(topic.id)}
                className={`min-h-[48px] flex-row items-center gap-2 rounded-input border-[1.5px] px-[18px] py-[13px] ${
                  isSelected ? fill.surface : 'border-hairline bg-card'
                }`}>
                <Text
                  variant="bodySm"
                  weight={isSelected ? 'bold' : 'semibold'}
                  color={isSelected ? fill.label : 'primary'}>
                  {t(topic.labelKey!)}
                </Text>
                {/* Selection carries a mark as well as a fill — never colour alone. */}
                {isSelected ? (
                  <Icon
                    name="check"
                    size={14}
                    color={fill.label === 'onBrand' ? 'onBrand' : 'textPrimary'}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <Text variant="caption" color="secondary" className="mb-3">
          {t('common.selectedCount', { count: localizeDigits(selected.length, i18n.language) })}
        </Text>
        {/* The CTA states the blocking condition rather than greying out silently. */}
        <Button
          label={enough ? t('common.continue') : t('onboarding.interests.blocked')}
          disabled={!enough}
          onPress={() => {
            update({ interests: selected });
            router.push('/onboarding/pace');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
