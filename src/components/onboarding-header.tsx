import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { localizeDigits } from '@/lib/format';

/**
 * Back, progress, and the step as text.
 *
 * The bar never carries progress on its own: «۲ از ۴» sits beside it, because
 * a fill length is not a status a screen reader or a low-vision reader can
 * read. Progress fills from the start edge, which is the right in RTL.
 */
export function OnboardingHeader({ step, total = 4 }: { step: number; total?: number }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const label = t('onboarding.step', {
    current: localizeDigits(step, i18n.language),
    total: localizeDigits(total, i18n.language),
  });

  return (
    <View className="flex-row items-center gap-3 px-5" style={{ height: MinTouchTarget }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => router.back()}
        className="items-center justify-center"
        style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
        <Icon name="chevronBack" size={20} />
      </Pressable>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        className="h-[6px] flex-1 overflow-hidden rounded-[3px] bg-track">
        <View className="h-full rounded-[3px] bg-brand" style={{ width: `${(step / total) * 100}%` }} />
      </View>

      <Text variant="caption" weight="bold" color="secondary">
        {label}
      </Text>
    </View>
  );
}
