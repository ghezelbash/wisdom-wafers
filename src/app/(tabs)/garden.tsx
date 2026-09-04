import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DownloadButton } from '@/components/download-button';
import { Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { OfflineBanner } from '@/components/offline-banner';
import { SeedCard } from '@/components/seed-card';
import { Text } from '@/components/Text';
import { BottomTabInset, MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { content } from '@/data/content-repository';
import { usedBytes } from '@/lib/catalog-store';
import { formatNumericDate } from '@/lib/date';
import { formatMegabytes } from '@/lib/format-bytes';
import { localizeDigits } from '@/lib/format';
import { listProgress, type SeedProgress } from '@/lib/progress-store';
import {
  dueItems,
  GRACE_DAYS,
  growthCount,
  nextReviewFor,
  upcomingItems,
  weeklyGrowth,
} from '@/lib/schedule';

type Segment = 'inProgress' | 'saved' | 'downloaded' | 'due' | 'completed';

const SEGMENTS: Segment[] = ['inProgress', 'saved', 'downloaded', 'due', 'completed'];

/**
 * Garden (باغچه).
 *
 * Five segments in one screen with a filter, not five destinations. Weekly
 * growth carries one grace day, explained in words rather than implied by a
 * dot — and "nothing due" is framed as good news, because it is.
 */
export default function GardenScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { snapshot } = useCatalog();
  const [progress, setProgress] = useState<SeedProgress[]>([]);
  const [segment, setSegment] = useState<Segment>('inProgress');

  useFocusEffect(
    useCallback(() => {
      listProgress().then(setProgress);
    }, [])
  );

  const cached = Object.values(snapshot.entries).filter((entry) => entry.state !== 'missing');
  const growth = weeklyGrowth(progress);
  const due = dueItems(progress);
  const upcoming = upcomingItems(progress);

  const buckets: Record<Segment, string[]> = {
    inProgress: progress
      .filter((item) => !item.completedAt && item.blockIndex > 0)
      .map((item) => item.seedId),
    saved: progress.filter((item) => item.saved).map((item) => item.seedId),
    downloaded: cached.map((entry) => entry.seedId),
    due: due.map((item) => item.seedId),
    completed: progress.filter((item) => item.completedAt).map((item) => item.seedId),
  };

  const ids = buckets[segment];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pb-4 pt-2">
        <Text variant="titleLg" className="mb-1">
          {t('garden.title')}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="caption" color="secondary">
            {t('garden.onDevice', {
              count: localizeDigits(cached.length, i18n.language),
            })}
          </Text>
          <MetaDot />
          <Text variant="caption" color="secondary">
            {t('storage.megabytes', {
              size: formatMegabytes(usedBytes(snapshot), i18n.language),
            })}
          </Text>
        </View>
      </View>

      <OfflineBanner />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-[56px] flex-none"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center' }}>
        {SEGMENTS.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === id }}
            onPress={() => setSegment(id)}
            className={`flex-row items-center gap-2 rounded-chip border px-3 py-2 ${
              segment === id ? 'border-brand bg-brand-tint' : 'border-hairline bg-card'
            }`}>
            <Text variant="caption" weight="bold" color={segment === id ? 'brand' : 'secondary'}>
              {t(`garden.segment.${id}`)}
            </Text>
            <Text variant="caption" color="secondary">
              {localizeDigits(buckets[id].length, i18n.language)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: BottomTabInset + 24 }}>
        <View className="mb-6 rounded-card border border-hairline bg-card p-4">
          <Text variant="caption" color="secondary" className="mb-2">
            {t('home.growthTitle')}
          </Text>
          <View className="mb-2 flex-row gap-1">
            {growth.map((filled, index) => (
              <View
                key={index}
                className={`h-2 w-2 rounded-full ${filled ? 'bg-brand' : 'bg-track'}`}
              />
            ))}
          </View>
          <Text variant="bodySm" weight="bold" className="mb-1">
            {t('home.growthValue', {
              count: localizeDigits(growthCount(growth), i18n.language),
              total: localizeDigits(7, i18n.language),
            })}
          </Text>
          {/* The grace day is spelled out, not implied. */}
          <Text variant="caption" color="secondary">
            {t('garden.graceDay', { count: localizeDigits(GRACE_DAYS, i18n.language) })}
          </Text>
        </View>

        {ids.length === 0 ? (
          // Every segment has its own empty copy — no shared «چیزی نیست».
          <View className="rounded-card border border-hairline bg-card p-5">
            <View className="mb-2 flex-row items-center gap-2">
              <Icon name={segment === 'due' ? 'check' : 'info'} size={18} color="brand" />
              <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
                {t(`garden.empty.${segment}.title`)}
              </Text>
            </View>
            <Text variant="bodySm" color="secondary">
              {t(`garden.empty.${segment}.body`)}
            </Text>
            {segment === 'due' && upcoming.length ? (
              <Text variant="caption" color="secondary" className="mt-3">
                {t('garden.nextReview', {
                  date: formatNumericDate(upcoming[0].dueAt, i18n.language),
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-3">
            {ids.map((seedId) => {
              const seed = content.getSeed(seedId);
              if (!seed) return null;
              const stored = progress.find((item) => item.seedId === seedId);
              const dueAt = stored ? nextReviewFor(stored) : undefined;

              if (segment === 'downloaded') {
                return (
                  <View
                    key={seedId}
                    className="rounded-card border border-hairline bg-card p-4">
                    <Text variant="bodySm" weight="bold" numberOfLines={2} className="mb-2">
                      {seed.title}
                    </Text>
                    <DownloadButton seedId={seedId} />
                  </View>
                );
              }

              return (
                <SeedCard
                  key={seedId}
                  variant={segment === 'due' ? 'review' : 'list'}
                  seed={seed}
                  completed={!!stored?.completedAt}
                  intervalDays={stored?.reviewInterval ?? 3}
                  dueLabel={
                    dueAt
                      ? t('topic.nextReview', { date: formatNumericDate(dueAt, i18n.language) })
                      : undefined
                  }
                  onPress={() =>
                    segment === 'due' ? router.push('/review') : router.push(`/seed/${seedId}`)
                  }
                />
              );
            })}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/storage')}
          className="mt-6 flex-row items-center gap-2"
          style={{ minHeight: MinTouchTarget }}>
          <Icon name="download" size={17} color="brand" />
          <Text variant="bodySm" weight="bold" color="brand">
            {t('garden.manageStorage')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
