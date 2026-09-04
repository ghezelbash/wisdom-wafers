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
import { localizeDigits } from '@/lib/format';
import { listProgress, type SeedProgress } from '@/lib/progress-store';

/** Path detail: the seeds in order, with how far along the reader is. */
export default function PathDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [progress, setProgress] = useState<SeedProgress[]>([]);

  useFocusEffect(
    useCallback(() => {
      listProgress().then(setProgress);
    }, [])
  );

  const path = content.getPath(id);
  if (!path) return null;

  const seeds = path.seedIds
    .map((seedId) => content.getSeed(seedId))
    .filter((seed): seed is NonNullable<typeof seed> => !!seed);
  const done = seeds.filter((seed) =>
    progress.some((item) => item.seedId === seed.id && item.completedAt)
  ).length;

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
        <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
          {path.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        <Text variant="bodySm" color="secondary" className="mb-4">
          {path.description}
        </Text>
        <Text variant="caption" weight="bold" color="brand" className="mb-5">
          {t('path.progress', {
            done: localizeDigits(done, i18n.language),
            total: localizeDigits(seeds.length, i18n.language),
          })}
        </Text>

        <View className="gap-3">
          {seeds.map((seed, position) => (
            <SeedCard
              key={seed.id}
              variant="list"
              seed={seed}
              placement="path"
              rank={position + 1}
              completed={progress.some((item) => item.seedId === seed.id && item.completedAt)}
              onPress={() => router.push(`/seed/${seed.id}`)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
