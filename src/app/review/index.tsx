import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SeedCard } from '@/components/seed-card';
import { SystemState } from '@/components/system-state';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { content } from '@/data/content-repository';
import { localizeDigits } from '@/lib/format';
import { listProgress, type SeedProgress } from '@/lib/progress-store';
import { dueItems, INTERVAL_DAYS } from '@/lib/schedule';
import { FeatureGate } from '@/components/feature-gate';

/** Roughly one minute per item; the queue says so before it starts. */
const MINUTES_PER_ITEM = 1;

/**
 * The due queue (آبیاری).
 *
 * Three items, about three minutes, and deferring is free: «بعداً مرور می‌کنم»
 * is a first-class action with no debt language anywhere near it.
 */
function ReviewQueueScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [progress, setProgress] = useState<SeedProgress[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listProgress().then(setProgress);
    }, [])
  );

  const due = dueItems(progress ?? []).slice(0, 3);
  const byId = Object.fromEntries((progress ?? []).map((item) => [item.seedId, item]));

  if (progress && due.length === 0) {
    // Nothing due is good news, and the screen says it that way.
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <SystemState
          icon="check"
          title={t('review.emptyTitle')}
          body={t('review.emptyBody')}
          primary={{ label: t('review.backHome'), onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

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
          {t('review.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        <Text variant="titleMd" className="mb-2">
          {t('review.readyCount', { count: localizeDigits(due.length, i18n.language) })}
        </Text>
        <Text variant="bodySm" color="secondary" className="mb-6">
          {t('review.intro', {
            minutes: localizeDigits(due.length * MINUTES_PER_ITEM, i18n.language),
          })}
        </Text>

        <View className="mb-6 gap-3">
          {due.map((item, index) => {
            const seed = content.getSeed(item.seedId);
            const stored = byId[item.seedId];
            if (!seed) return null;
            return (
              <SeedCard
                key={item.seedId}
                variant="review"
                seed={seed}
                placement="garden"
                rank={index + 1}
                intervalDays={stored?.reviewInterval ?? INTERVAL_DAYS.hard}
                dueLabel={t('review.pass', {
                  count: localizeDigits((stored?.reviewCount ?? 0) + 1, i18n.language),
                })}
                onPress={() => router.push('/review/session')}
              />
            );
          })}
        </View>

        <Text variant="caption" color="secondary" className="mb-6">
          {t('review.deferNote')}
        </Text>
      </ScrollView>

      <View className="px-5 pb-7">
        <Button
          label={t('review.start')}
          onPress={() => router.push('/review/session')}
          className="mb-2"
        />
        {/* Deferring costs nothing, and is offered at the same size. */}
        <Button
          variant="secondary"
          size="lg"
          label={t('review.defer')}
          onPress={() => router.back()}
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * Review is a killable feature, so the route refuses for itself — a deep link
 * or a stale reminder does not pass the button that leads here.
 */
export default function GatedReview() {
  return (
    <FeatureGate flag="reviewEnabled">
      <ReviewQueueScreen />
    </FeatureGate>
  );
}
