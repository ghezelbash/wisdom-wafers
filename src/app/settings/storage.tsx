import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { useTheme } from '@/hooks/use-theme';
import { imageBytes, STORAGE_QUOTA_BYTES, textBytes, usedBytes } from '@/lib/catalog-store';
import { formatMegabytes } from '@/lib/format-bytes';
import { listProgress } from '@/lib/progress-store';

/**
 * Storage manager.
 *
 * The bar is bound to used/total, not drawn to a pleasing width, and each
 * clearing action states what it costs before it is pressed.
 */
export default function StorageScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { snapshot, clearAllDownloads, clearImagesOfCompleted } = useCatalog();
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    listProgress().then((all) =>
      setCompletedIds(all.filter((item) => item.completedAt).map((item) => item.seedId))
    );
  }, []);

  const used = usedBytes(snapshot);
  const percent = Math.min(100, (used / STORAGE_QUOTA_BYTES) * 100);
  const completedImageBytes = completedIds
    .map((id) => snapshot.entries[id])
    .filter((entry) => entry?.state === 'cached')
    .reduce((total, entry) => total + (entry?.imageBytes ?? 0), 0);

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
          {t('storage.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View className="mb-6 rounded-card border border-hairline bg-card p-4">
          <Text variant="titleMd" className="mb-1">
            {t('storage.used', { size: formatMegabytes(used, i18n.language) })}
          </Text>
          <Text variant="caption" color="secondary" className="mb-4">
            {t('storage.quota', {
              size: formatMegabytes(STORAGE_QUOTA_BYTES, i18n.language),
            })}
          </Text>

          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('storage.barA11y', { percent: Math.round(percent) })}
            className="mb-3 h-2 overflow-hidden rounded-chip bg-track">
            <View className="h-full rounded-chip bg-brand" style={{ width: `${percent}%` }} />
          </View>

          <View className="flex-row gap-4">
            <Text variant="caption" color="secondary">
              {t('storage.text', { size: formatMegabytes(textBytes(snapshot), i18n.language) })}
            </Text>
            <Text variant="caption" color="secondary">
              {t('storage.images', { size: formatMegabytes(imageBytes(snapshot), i18n.language) })}
            </Text>
          </View>
        </View>

        <Text variant="caption" weight="bold" color="secondary" className="mb-2 px-1">
          {t('storage.autoDownload')}
        </Text>
        <View className="mb-6 overflow-hidden rounded-card border border-hairline bg-card">
          <View
            className="flex-row items-center gap-3 border-b border-hairline p-4"
            style={{ minHeight: MinTouchTarget + 8 }}>
            <View className="min-w-0 flex-1">
              <Text variant="bodySm">{t('storage.tomorrowSeed')}</Text>
              <Text variant="caption" color="secondary">
                {t('storage.wifiOnly')}
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={setWifiOnly}
              trackColor={{ false: theme.borderStrong, true: theme.brand }}
              thumbColor={theme.card}
            />
          </View>
          <View
            className="flex-row items-center gap-3 p-4"
            style={{ minHeight: MinTouchTarget + 8 }}>
            <View className="min-w-0 flex-1">
              <Text variant="bodySm">{t('storage.lowData')}</Text>
              <Text variant="caption" color="secondary">
                {t('storage.lowDataBody')}
              </Text>
            </View>
            <Switch
              value={lowData}
              onValueChange={setLowData}
              trackColor={{ false: theme.borderStrong, true: theme.brand }}
              thumbColor={theme.card}
            />
          </View>
        </View>

        <Text variant="caption" weight="bold" color="secondary" className="mb-2 px-1">
          {t('storage.clear')}
        </Text>
        <View className="overflow-hidden rounded-card border border-hairline bg-card">
          <Pressable
            accessibilityRole="button"
            onPress={() => clearImagesOfCompleted(completedIds)}
            className="flex-row items-center gap-3 border-b border-hairline p-4"
            style={{ minHeight: MinTouchTarget + 8 }}>
            <Text variant="bodySm" className="min-w-0 flex-1">
              {t('storage.clearCompletedImages')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('storage.megabytes', {
                size: formatMegabytes(completedImageBytes, i18n.language),
              })}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={clearAllDownloads}
            className="flex-row items-center gap-3 p-4"
            style={{ minHeight: MinTouchTarget + 8 }}>
            <Text variant="bodySm" color="error" className="min-w-0 flex-1">
              {t('storage.clearAll')}
            </Text>
            <Text variant="caption" color="secondary">
              {t('storage.megabytes', { size: formatMegabytes(used, i18n.language) })}
            </Text>
          </Pressable>
        </View>

        {/* Clearing never touches the bundled seed, and the screen says so. */}
        <Text variant="caption" color="secondary" className="mt-3 px-1">
          {t('storage.bundledNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
