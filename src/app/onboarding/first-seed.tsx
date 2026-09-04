import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { OnboardingHeader } from '@/components/onboarding-header';
import { Text } from '@/components/Text';
import { useSession } from '@/context/SessionContext';
import { content } from '@/data/content-repository';
import { topicLabel } from '@/data/topics';
import { localizeDigits } from '@/lib/format';
import { track } from '@/platform/analytics';

const chipStyles = {
  sciences: { surface: 'bg-brand-tint', color: 'brand' },
  humanities: { surface: 'bg-plum-tint', color: 'plum' },
  practical: { surface: 'bg-sun-tint', color: 'sun' },
} as const;

/** 4 · First seed handoff — bundled with the app, so it works offline. */
export default function FirstSeedScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { completeOnboarding, session } = useSession();

  // The bundled seed: it ships in the binary, so this works on a dead network.
  const seed = content.getBundledSeed();
  const topic = content.getTopic(seed.topicId);
  const chip = chipStyles[topic?.family ?? 'sciences'];
  const minutes = t('seed.minutes', {
    count: localizeDigits(seed.estimatedMinutes, i18n.language),
  });

  const start = () => {
    track('onboarding_completed', {
      topic_count: session.interests.length,
      pace: session.pace ?? 'unset',
      duration_ms: 0,
    });
    completeOnboarding();
    router.replace(`/seed/${seed.id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <OnboardingHeader step={4} />

      <View className="flex-1 px-6 pt-[18px]">
        <Text variant="caption" weight="bold" color="secondary" className="mb-4">
          {t('onboarding.firstSeed.eyebrow')}
        </Text>

        <View className="overflow-hidden rounded-sheet border border-hairline bg-card">
          {/* Illustration slot: one commissioned editorial image per topic, 3:2.
              Never metadata over the image, and never the only way to tell two
              seeds apart — so the card reads fine while the slot is empty. */}
          <View className="h-[118px] items-center justify-center border-b border-hairline bg-track">
            <Text variant="caption" color="secondary">
              {t('seed.illustration', { topic: topicLabel(topic, t) })}
            </Text>
          </View>

          <View className="p-[18px]">
            <View className="mb-3 flex-row items-center gap-2">
              <View className={`rounded-chip px-[10px] py-[5px] ${chip.surface}`}>
                <Text variant="caption" weight="bold" color={chip.color}>
                  {topicLabel(topic, t)}
                </Text>
              </View>
              <View className="flex-row items-center gap-[7px]">
                <Text variant="caption" color="secondary">
                  {minutes}
                </Text>
                <MetaDot />
                <Text variant="caption" color="secondary">
                  {t(`seed.level.${seed.difficulty}`)}
                </Text>
              </View>
            </View>

            <Text variant="titleMd" className="mb-2">
              {seed.title}
            </Text>
            <Text variant="bodySm" color="secondary">
              {seed.promise}
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row items-center gap-[9px] rounded-input bg-brand-tint px-4 py-3">
          <Icon name="download" size={17} color="brand" />
          <Text variant="caption" weight="semibold" className="min-w-0 flex-1">
            {t('onboarding.firstSeed.offline')}
          </Text>
        </View>
      </View>

      <View className="px-6 pb-7 pt-[14px]">
        <Button label={t('onboarding.firstSeed.cta')} onPress={start} className="mb-2" />
        <Button
          variant="ghost"
          label={t('onboarding.firstSeed.another')}
          onPress={() => router.back()}
        />
      </View>
    </SafeAreaView>
  );
}
