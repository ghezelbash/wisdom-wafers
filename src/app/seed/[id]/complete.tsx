import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { BrandMark, Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { Text } from '@/components/Text';
import { content } from '@/data/content-repository';
import { topicLabel } from '@/data/topics';
import { useIdentity } from '@/context/AuthContext';
import { useSession } from '@/context/SessionContext';
import { addDays, formatNumericDate } from '@/lib/date';
import { localizeDigits } from '@/lib/format';
import { listProgress, loadProgress, saveProgress, type SeedProgress } from '@/lib/progress-store';
import { ASSESSED_TYPES, type SummaryBlock } from '@/models/seed';
import { savedEntry } from '@/domain/account/push';
import { queueSaved } from '@/domain/account/intents';

/** Days until the scheduler asks the summary points back. */
const FIRST_REVIEW_IN_DAYS = 3;

/**
 * Completion.
 *
 * The headline is literal — a first-time reader should never have to decode a
 * metaphor to know the seed ended. The metaphor lives in the ring beside it.
 */
export default function SeedCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const { isGuest, identity } = useIdentity();

  const seed = useMemo(() => content.getSeed(id), [id]);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!seed) return;
    loadProgress(seed.id, seed.revision).then(setProgress);
    listProgress().then((all) => setCompletedCount(all.filter((item) => item.completedAt).length));
  }, [seed]);

  // The two asks come after the value, never before it, and only once.
  useEffect(() => {
    if (!seed || !progress?.completedAt) return;
    if (!session.notificationsAsked) {
      router.push('/notification-ask');
    } else if (isGuest && !session.accountOfferSeen) {
      router.push('/account-offer');
    }
  }, [seed, progress?.completedAt, session.notificationsAsked, session.accountOfferSeen, isGuest, router]);

  if (!seed) return null;

  const summary = seed.blocks.find((block) => block.type === 'summary') as SummaryBlock | undefined;
  const assessed = seed.blocks.filter((block) => ASSESSED_TYPES.has(block.type));
  const correct = assessed.filter((block) => progress?.answers[block.id]?.correct).length;
  const nextReview = addDays(new Date().toISOString(), FIRST_REVIEW_IN_DAYS);
  const next = content.getNextSeed(seed.id);
  const nextTopic = next ? content.getTopic(next.topicId) : undefined;

  const share = () => {
    Share.share({ message: `${seed.title}\n${seed.promise}` }).catch(() => {
      // Sharing is an offer; a dismissed share sheet is not an error.
    });
  };

  const toggleSave = () => {
    if (!progress) return;
    const updated = { ...progress, saved: !progress.saved };
    setProgress(updated);
    saveProgress(updated);
    // Local first, then queued — durably, so an un-save made offline still
    // reaches the reader's other device.
    void queueSaved(
      { uid: identity?.uid ?? null, isAccount: identity?.source === 'account' },
      savedEntry(updated.seedId, !!updated.saved)
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <View className="mb-6 flex-row items-center gap-4">
          <BrandMark size={56} />
          <View className="min-w-0 flex-1">
            <Text variant="titleLg">{t('complete.title')}</Text>
            <View className="flex-row items-center gap-2">
              <Text variant="caption" color="secondary">
                {t('complete.nth', { count: localizeDigits(completedCount, i18n.language) })}
              </Text>
              <MetaDot />
              <Text variant="caption" color="secondary">
                {t('seed.minutes', {
                  count: localizeDigits(seed.estimatedMinutes, i18n.language),
                })}
              </Text>
            </View>
          </View>
        </View>

        {summary ? (
          <View className="mb-5">
            <Text variant="bodySm" weight="bold" className="mb-3">
              {t('player.summary.title')}
            </Text>
            <View className="gap-2">
              {summary.points.map((point, pointIndex) => (
                <View
                  key={pointIndex}
                  className="flex-row items-start gap-3 rounded-card border border-hairline bg-card p-4">
                  <View className="h-6 w-6 shrink-0 items-center justify-center rounded-chip bg-brand-tint">
                    <Text variant="caption" weight="bold" color="brand">
                      {localizeDigits(pointIndex + 1, i18n.language)}
                    </Text>
                  </View>
                  <Text variant="bodySm" className="min-w-0 flex-1">
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mb-5 flex-row gap-3">
          {assessed.length > 0 ? (
            <View className="flex-1 rounded-card border border-hairline bg-card p-4">
              <Text variant="caption" color="secondary" className="mb-1">
                {t('complete.correct')}
              </Text>
              <Text variant="titleMd">
                {t('complete.correctValue', {
                  correct: localizeDigits(correct, i18n.language),
                  total: localizeDigits(assessed.length, i18n.language),
                })}
              </Text>
            </View>
          ) : null}
          <View className="flex-1 rounded-card border border-hairline bg-card p-4">
            <Text variant="caption" color="secondary" className="mb-1">
              {t('complete.nextReview')}
            </Text>
            <Text variant="titleMd">{formatNumericDate(nextReview, i18n.language)}</Text>
          </View>
        </View>

        <View className="mb-6 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !!progress?.saved }}
            onPress={toggleSave}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-card border border-hairline bg-card"
            style={{ minHeight: 48 }}>
            <Icon name="bookmark" size={17} color={progress?.saved ? 'brand' : 'textPrimary'} />
            <Text variant="bodySm" weight="bold" color={progress?.saved ? 'brand' : 'primary'}>
              {t('complete.save')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={share}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-card border border-hairline bg-card"
            style={{ minHeight: 48 }}>
            <Icon name="download" size={17} />
            <Text variant="bodySm" weight="bold">
              {t('complete.share')}
            </Text>
          </Pressable>
        </View>

        {next ? (
          <View className="mb-2">
            <Text variant="caption" weight="bold" color="secondary" className="mb-2">
              {t('complete.next')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(`/seed/${next.id}`)}
              className="rounded-card border border-hairline bg-card p-4">
              <Text variant="bodySm" weight="bold" className="mb-2">
                {next.title}
              </Text>
              <View className="flex-row items-center gap-2">
                <Text variant="caption" color="secondary">
                  {topicLabel(nextTopic, t)}
                </Text>
                <MetaDot />
                <Text variant="caption" color="secondary">
                  {t('seed.minutes', {
                    count: localizeDigits(next.estimatedMinutes, i18n.language),
                  })}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View className="px-6 pb-7 pt-2">
        {next ? (
          <Button
            label={t('complete.nextCta')}
            onPress={() => router.replace(`/seed/${next.id}`)}
            className="mb-2"
          />
        ) : null}
        <Button
          variant={next ? 'ghost' : 'primary'}
          label={t('complete.done')}
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}
