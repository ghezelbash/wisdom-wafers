import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OfflineBanner } from '@/components/offline-banner';
import { SeedCard } from '@/components/seed-card';
import { Text } from '@/components/Text';
import { BottomTabInset, MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { useSession } from '@/context/SessionContext';
import { content } from '@/data/content-repository';
import { formatLongDate } from '@/lib/date';
import { localizeDigits } from '@/lib/format';
import { listProgress, type SeedProgress } from '@/lib/progress-store';
import { dueItems, growthCount, weeklyGrowth } from '@/lib/schedule';
import { rankSeeds, type RankerSignals } from '@/domain/recommendation/rank';
import type { Seed } from '@/models/seed';

function greetingKey(hour: number): string {
  if (hour < 12) return 'home.morning';
  if (hour < 17) return 'home.afternoon';
  if (hour < 21) return 'home.evening';
  return 'home.night';
}

function Rail({
  title,
  seeds,
  onOpen,
}: {
  title: string;
  seeds: Seed[];
  onOpen: (seed: Seed) => void;
}) {
  if (!seeds.length) return null;
  return (
    <View className="mb-8">
      <Text variant="bodySm" weight="bold" className="mb-3 px-5">
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {seeds.map((seed, position) => (
          <SeedCard
            key={seed.id}
            variant="rail"
            seed={seed}
            placement="home_rail"
            rank={position + 1}
            onPress={() => onOpen(seed)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Home.
 *
 * Continue outranks the recommendation, because a half-finished seed is the
 * highest-intent thing on screen. Four finite rails, then an explicit end —
 * there is no infinite scroll, and the ending is what makes the Explore CTA
 * mean something.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { refresh } = useCatalog();

  const [progress, setProgress] = useState<SeedProgress[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listProgress().then((all) => {
        if (!cancelled) setProgress(all);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const open = (seed: Seed) => router.push(`/seed/${seed.id}`);

  const interestTopic = session.interests[0];

  /**
   * What the ranker knows about this reader. Everything here is on-device;
   * nothing is inferred from behaviour the reader has not seen recorded.
   */
  const signals: RankerSignals = useMemo(
    () => ({
      interests: session.interests,
      inProgress: (progress ?? [])
        .filter((item) => !item.completedAt && item.blockIndex > 0)
        .map((item) => item.seedId),
      reviewDue: dueItems(progress ?? []).map((item) => item.seedId),
      completed: (progress ?? []).filter((item) => item.completedAt).map((item) => item.seedId),
      paceMinutes: session.pace === 'one' ? 8 : session.pace === 'two' ? 15 : 10,
      preferredDifficulty: 'intro',
      now: new Date().toISOString(),
      locale: i18n.language,
    }),
    [session.interests, session.pace, progress, i18n.language]
  );

  // The hero is the top-ranked seed, not a fixed one — and it carries the
  // reason that put it there. Anything half-finished is excluded: it already
  // has the continue slot above, and offering it twice wastes the screen.
  const ranked = useMemo(
    () =>
      rankSeeds(
        content.listSeeds().filter((seed) => !signals.inProgress.includes(seed.id)),
        signals,
        12
      ),
    [signals]
  );
  const heroPick = ranked[0];
  const hero = heroPick?.seed ?? content.getBundledSeed();

  const rails = useMemo(() => {
    const all = content.listSeeds();
    const interest = interestTopic
      ? all.filter((seed) => seed.topicId === interestTopic && seed.id !== hero.id)
      : [];
    const short = all.filter((seed) => seed.estimatedMinutes <= 5 && seed.id !== hero.id);
    const pathSeeds = content
      .listPaths()
      .flatMap((path) => path.seedIds)
      .map((id) => content.getSeed(id))
      .filter((seed): seed is Seed => !!seed);
    const others = all.filter(
      (seed) => seed.id !== hero.id && !session.interests.includes(seed.topicId)
    );
    return { interest, short, pathSeeds, others };
  }, [hero.id, interestTopic, session.interests]);

  // Loading shows a skeleton because there is nothing to show yet. Refreshing
  // keeps the old content legible — pull-to-refresh never blanks the screen.
  const loading = progress === null;

  const continueEntry = progress?.find((item) => !item.completedAt && item.blockIndex > 0);
  const continueSeed = continueEntry ? content.getSeed(continueEntry.seedId) : undefined;
  const growth = weeklyGrowth(progress ?? []);
  const due = dueItems(progress ?? []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setProgress(await listProgress());
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BottomTabInset + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="flex-row items-center justify-between px-5 pb-5 pt-2">
          <View className="min-w-0 flex-1">
            <Text variant="titleMd">{t(greetingKey(new Date().getHours()))}</Text>
            <Text variant="caption" color="secondary">
              {formatLongDate(new Date().toISOString(), i18n.language)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('search.open')}
            onPress={() => router.push('/search')}
            className="items-center justify-center rounded-input border border-hairline bg-card"
            style={{ width: MinTouchTarget, height: MinTouchTarget }}>
            <Icon name="search" size={19} />
          </Pressable>
        </View>

        <OfflineBanner />

        {loading ? (
          <View className="px-5">
            <SeedCard variant="skeleton" />
          </View>
        ) : (
          <>
            {continueSeed && continueEntry ? (
              <View className="px-5">
                <SeedCard
                  variant="continue"
                  seed={continueSeed}
                  progress={continueEntry.blockIndex / continueSeed.blocks.length}
                  minutesLeft={Math.max(
                    1,
                    Math.round(
                      continueSeed.estimatedMinutes *
                        (1 - continueEntry.blockIndex / continueSeed.blocks.length)
                    )
                  )}
                  onPress={() => open(continueSeed)}
                />
              </View>
            ) : null}

            <View className="mb-6 flex-row gap-3 px-5">
              <View className="min-w-0 flex-1 rounded-card border border-hairline bg-card p-4">
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
                <Text variant="bodySm" weight="bold">
                  {t('home.growthValue', {
                    count: localizeDigits(growthCount(growth), i18n.language),
                    total: localizeDigits(7, i18n.language),
                  })}
                </Text>
              </View>

              <View className="min-w-0 flex-1 rounded-card border border-hairline bg-card p-4">
                <Text variant="caption" color="secondary" className="mb-2">
                  {t('home.dueTitle')}
                </Text>
                <Text variant="titleMd" className="mb-1">
                  {localizeDigits(due.length, i18n.language)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={due.length === 0}
                  onPress={() => router.push('/review')}>
                  <Text
                    variant="caption"
                    weight="bold"
                    color={due.length ? 'brand' : 'secondary'}>
                    {due.length ? t('home.startReview') : t('home.nothingDue')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="mb-8 px-5">
              <Text variant="bodySm" weight="bold" className="mb-3">
                {t('home.todaySeed')}
              </Text>
              <SeedCard
                variant="hero"
                seed={hero}
                placement="home_hero"
                rank={1}
                reason={
                  heroPick?.reason
                    ? { code: heroPick.reason, topicId: hero.topicId }
                    : undefined
                }
                onPress={() => open(hero)}
              />
            </View>

            {interestTopic ? (
              <Rail
                title={t('reason.interest', {
                  topic: t(`topics.${interestTopic}`, { defaultValue: interestTopic }),
                })}
                seeds={rails.interest}
                onOpen={open}
              />
            ) : null}
            <Rail title={t('home.railShort')} seeds={rails.short} onOpen={open} />
            <Rail title={t('home.railPaths')} seeds={rails.pathSeeds} onOpen={open} />
            <Rail title={t('home.railOthers')} seeds={rails.others} onOpen={open} />

            {/* Home ends. That costs sessions-per-day and protects the
                "not a feed" positioning. */}
            <View className="items-center px-5 pt-2">
              <Text variant="bodySm" color="secondary" className="mb-3 text-center">
                {t('home.endTitle')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/explore')}
                className="rounded-card border border-hairline bg-card px-6"
                style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text variant="bodySm" weight="bold" color="brand">
                  {t('home.endCta')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
