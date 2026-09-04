import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TopicChip } from '@/components/seed-card';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { content, recallItemsFor } from '@/data/content-repository';
import { localizeDigits } from '@/lib/format';
import { listProgress, saveProgress, type SeedProgress } from '@/lib/progress-store';
import { useIdentity } from '@/context/AuthContext';
import { recordReviewed } from '@/domain/progress/events';
import { dueItems, growthCount, weeklyGrowth, INTERVAL_DAYS, type Confidence } from '@/lib/schedule';
import type { Seed } from '@/models/seed';

const CONFIDENCES: Confidence[] = ['easy', 'good', 'hard', 'again'];

interface Outcome {
  seed: Seed;
  confidence: Confidence;
}

/**
 * The review session.
 *
 * The answer stays covered until the reader has attempted recall — revealing
 * first turns retrieval practice into re-reading, which is the one thing this
 * screen must not allow. Confidence is recorded separately from correctness,
 * and each rating states the interval it produces, so the scheduler is legible.
 */
export default function ReviewSessionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const { identity } = useIdentity();
  const [progress, setProgress] = useState<SeedProgress[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    listProgress().then(setProgress);
  }, []);

  const queue = useMemo(() => {
    if (!progress) return [];
    return dueItems(progress)
      .slice(0, 3)
      .map((item) => content.getSeed(item.seedId))
      .filter((seed): seed is Seed => !!seed);
  }, [progress]);

  if (!progress) return <SafeAreaView className="flex-1 bg-canvas" />;

  if (finished) {
    const growth = weeklyGrowth(progress);
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text variant="titleLg" className="mb-2">
            {t('review.resultsTitle')}
          </Text>
          <Text variant="bodySm" color="secondary" className="mb-6">
            {t('review.resultsBody', {
              count: localizeDigits(outcomes.length, i18n.language),
            })}
          </Text>

          <View className="mb-6 gap-3">
            {outcomes.map((outcome) => (
              <View
                key={outcome.seed.id}
                className="rounded-card border border-hairline bg-card p-4">
                <Text variant="bodySm" weight="bold" numberOfLines={2} className="mb-1">
                  {outcome.seed.title}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text variant="caption" color="secondary">
                    {t(`review.confidence.${outcome.confidence}`)}
                  </Text>
                  <Text variant="caption" weight="bold" color="brand">
                    {t('review.nextIn', {
                      days: localizeDigits(INTERVAL_DAYS[outcome.confidence], i18n.language),
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="mb-8 rounded-card border border-hairline bg-card p-4">
            <Text variant="caption" color="secondary" className="mb-2">
              {t('home.growthTitle')}
            </Text>
            <View className="mb-2 flex-row gap-1">
              {growth.map((filled, dayIndex) => (
                <View
                  key={dayIndex}
                  className={`h-2 w-2 rounded-full ${filled ? 'bg-brand' : 'bg-track'}`}
                />
              ))}
            </View>
            <Text variant="bodySm" weight="bold">
              {t('home.growthValue', {
                count: localizeDigits(growthCount(growth), i18n.language),
                total: localizeDigits(7, i18n.language),
              })}
            </Text>
          </View>

          <Button label={t('review.backHome')} onPress={() => router.replace('/(tabs)')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const seed = queue[index];
  if (!seed) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas">
        <Button label={t('review.backHome')} onPress={() => router.replace('/(tabs)')} />
      </SafeAreaView>
    );
  }

  const recall = recallItemsFor(seed)[0];

  const rate = (confidence: Confidence) => {
    const reviewedAt = new Date().toISOString();
    const stored = progress.find((item) => item.seedId === seed.id);
    if (stored) {
      saveProgress({
        ...stored,
        reviewedAt,
        reviewInterval: INTERVAL_DAYS[confidence],
        reviewCount: (stored.reviewCount ?? 0) + 1,
      });
    }
    // Queued like a completion: a review done on a plane still counts.
    if (identity) {
      void recordReviewed({
        uid: identity.uid,
        seedId: seed.id,
        revision: seed.revision,
        confidence,
        occurredAt: reviewedAt,
      });
    }
    const next = [...outcomes, { seed, confidence }];
    setOutcomes(next);
    setRevealed(false);
    if (index + 1 >= queue.length) setFinished(true);
    else setIndex(index + 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-5" style={{ height: 56 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.close')}
          onPress={() => router.back()}
          className="items-center justify-center"
          style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
          <Icon name="close" size={19} />
        </Pressable>
        <Text variant="label" className="min-w-0 flex-1">
          {t('review.sessionTitle')}
        </Text>
        <Text variant="caption" weight="bold" color="secondary">
          {t('player.progress', {
            current: localizeDigits(index + 1, i18n.language),
            total: localizeDigits(queue.length, i18n.language),
          })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
        <View className="mb-4 flex-row items-center gap-2">
          <View className="shrink-0 rounded-chip bg-brand-tint px-[9px] py-[5px]">
            <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
              {t('review.recallBadge')}
            </Text>
          </View>
          <TopicChip topicId={seed.topicId} />
        </View>

        <Text variant="titleMd" className="mb-3" style={{ fontSize: 19, lineHeight: 30 }}>
          {recall?.prompt ?? seed.title}
        </Text>
        <Text variant="caption" color="secondary" className="mb-6">
          {t('review.recallHint')}
        </Text>

        {revealed ? (
          <View className="mb-6 rounded-card border border-hairline bg-card p-4">
            <Text variant="caption" weight="bold" color="secondary" className="mb-2">
              {t('review.answer')}
            </Text>
            <Text variant="bodySm">{recall?.answer ?? ''}</Text>
          </View>
        ) : (
          <View className="mb-6 items-center rounded-card border border-dashed border-strong bg-card p-6">
            <Icon name="lock" size={22} color="textSecondary" />
            <Text variant="caption" color="secondary" className="mt-2 text-center">
              {t('review.covered')}
            </Text>
          </View>
        )}

        {revealed ? (
          <>
            <Text variant="bodySm" weight="bold" className="mb-1">
              {t('review.confidenceTitle')}
            </Text>
            <Text variant="caption" color="secondary" className="mb-4">
              {t('review.confidenceNote')}
            </Text>

            <View className="gap-2">
              {CONFIDENCES.map((confidence) => (
                <Pressable
                  key={confidence}
                  accessibilityRole="button"
                  onPress={() => rate(confidence)}
                  className="flex-row items-center gap-3 rounded-input border-[1.5px] border-hairline bg-card p-4"
                  style={{ minHeight: 56 }}>
                  <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
                    {t(`review.confidence.${confidence}`)}
                  </Text>
                  {/* Each rating states the interval it produces. */}
                  <Text variant="caption" color="secondary">
                    {confidence === 'again'
                      ? t('review.tomorrow')
                      : t('review.nextIn', {
                          days: localizeDigits(INTERVAL_DAYS[confidence], i18n.language),
                        })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {!revealed ? (
        <View className="px-5 pb-7">
          <Button label={t('review.reveal')} onPress={() => setRevealed(true)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
