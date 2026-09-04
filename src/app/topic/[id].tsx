import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SeedCard } from '@/components/seed-card';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { content } from '@/data/content-repository';
import { getTopic, topicLabel } from '@/data/topics';
import { formatNumericDate } from '@/lib/date';
import { localizeDigits } from '@/lib/format';
import { listProgress, type SeedProgress } from '@/lib/progress-store';
import { nextReviewFor } from '@/lib/schedule';

/** Topic detail: paths above loose seeds. */
export default function TopicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [progress, setProgress] = useState<SeedProgress[]>([]);

  useFocusEffect(
    useCallback(() => {
      listProgress().then(setProgress);
    }, [])
  );

  const topic = getTopic(id);
  const seeds = content.listSeedsByTopic(id);
  const paths = content.listPathsForTopic(id);
  const completed = progress.filter((item) => item.completedAt).map((item) => item.seedId);

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
          {topicLabel(topic, t)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        <View className="mb-6 flex-row gap-3">
          <View className="min-w-0 flex-1 rounded-card border border-hairline bg-card p-3">
            <Text variant="titleMd">{localizeDigits(seeds.length, i18n.language)}</Text>
            <Text variant="caption" color="secondary">
              {t('topic.seeds')}
            </Text>
          </View>
          <View className="min-w-0 flex-1 rounded-card border border-hairline bg-card p-3">
            <Text variant="titleMd">{localizeDigits(paths.length, i18n.language)}</Text>
            <Text variant="caption" color="secondary">
              {t('topic.paths')}
            </Text>
          </View>
          <View className="min-w-0 flex-1 rounded-card border border-hairline bg-card p-3">
            <Text variant="titleMd">
              {localizeDigits(
                seeds.filter((seed) => completed.includes(seed.id)).length,
                i18n.language
              )}
            </Text>
            <Text variant="caption" color="secondary">
              {t('topic.completed')}
            </Text>
          </View>
        </View>

        {paths.length ? (
          <View className="mb-6">
            <Text variant="bodySm" weight="bold" className="mb-3">
              {t('explore.paths')}
            </Text>
            <View className="gap-3">
              {paths.map((path) => (
                <Pressable
                  key={path.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/path/${path.id}`)}
                  className="rounded-card border border-hairline bg-card p-4">
                  <Text variant="bodySm" weight="bold" className="mb-1">
                    {path.title}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {t('explore.seedCount', {
                      count: localizeDigits(path.seedIds.length, i18n.language),
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Text variant="bodySm" weight="bold" className="mb-3">
          {t('topic.seedsHere')}
        </Text>
        <View className="gap-3">
          {seeds.map((seed, position) => {
            const entry = progress.find((item) => item.seedId === seed.id);
            const due = entry ? nextReviewFor(entry) : undefined;
            return (
              <SeedCard
                key={seed.id}
                variant="list"
                seed={seed}
                placement="topic"
                rank={position + 1}
                completed={!!entry?.completedAt}
                dueLabel={
                  due
                    ? t('topic.nextReview', { date: formatNumericDate(due, i18n.language) })
                    : undefined
                }
                onPress={() => router.push(`/seed/${seed.id}`)}
              />
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
