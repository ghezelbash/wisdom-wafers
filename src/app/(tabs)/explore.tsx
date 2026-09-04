import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OfflineBanner } from '@/components/offline-banner';
import { Text } from '@/components/Text';
import { BottomTabInset, MinTouchTarget } from '@/constants/theme';
import { content } from '@/data/content-repository';
import { INTEREST_TOPICS, topicLabel } from '@/data/topics';
import { localizeDigits } from '@/lib/format';

const familySurface = {
  sciences: 'bg-brand-tint',
  humanities: 'bg-plum-tint',
  practical: 'bg-sun-tint',
} as const;

const familyInk = {
  sciences: 'brand',
  humanities: 'plum',
  practical: 'sun',
} as const;

/**
 * Explore.
 *
 * Six topics across three accent families — six distinct hues would collide
 * with the correct / incorrect / offline semantics. Paths sit above loose
 * seeds, and search is a pushed screen rather than a fifth tab.
 */
export default function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const topics = INTEREST_TOPICS.filter((topic) => content.topicStats(topic.id).seeds > 0);
  const paths = content.listPaths();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: BottomTabInset + 24 }}>
        <View className="px-5 pb-4 pt-2">
          <Text variant="titleLg" className="mb-4">
            {t('explore.title')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/search')}
            className="flex-row items-center gap-3 rounded-input border border-hairline bg-card px-4"
            style={{ minHeight: MinTouchTarget + 4 }}>
            <Icon name="search" size={18} color="textSecondary" />
            <Text variant="bodySm" color="secondary">
              {t('search.placeholder')}
            </Text>
          </Pressable>
        </View>

        <OfflineBanner />

        <View className="mb-8 px-5">
          <View className="mb-3 flex-row items-baseline gap-2">
            <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
              {t('explore.topics')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('explore.topicCount', { count: localizeDigits(topics.length, i18n.language) })}
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-3">
            {topics.map((topic) => {
              const stats = content.topicStats(topic.id);
              return (
                <Pressable
                  key={topic.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/topic/${topic.id}`)}
                  className={`min-h-[92px] flex-1 basis-[45%] justify-between rounded-card border border-hairline p-4 ${
                    familySurface[topic.family]
                  }`}>
                  <Text variant="bodySm" weight="bold" color={familyInk[topic.family]}>
                    {topicLabel(topic, t)}
                  </Text>
                  <View>
                    <Text variant="caption" color="secondary">
                      {t('explore.seedCount', {
                        count: localizeDigits(stats.seeds, i18n.language),
                      })}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('explore.pathCount', {
                        count: localizeDigits(stats.paths, i18n.language),
                      })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4 px-5">
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
                <Text variant="caption" color="secondary" className="mb-2">
                  {path.description}
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
      </ScrollView>
    </SafeAreaView>
  );
}
