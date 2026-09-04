import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { formatMegabytes } from '@/lib/format-bytes';

/**
 * Download state for one seed: missing, downloading with real bytes, cached, or
 * corrupt with a retry.
 *
 * The accessible label announces the size *before* the action, so nobody starts
 * a download on a metered connection without knowing what it costs — and the
 * size is the one the manifest published, never an estimate. If nothing
 * declares a size, the label says so rather than naming a number.
 */
export function DownloadButton({ seedId }: { seedId: string }) {
  const { t, i18n } = useTranslation();
  const { entryFor, sizeFor, download, retry, downloadsEnabled } = useCatalog();
  const entry = entryFor(seedId);

  // Switched off remotely: nothing is offered rather than something that fails.
  // A copy already on the device keeps working — the reader was promised it.
  if (!downloadsEnabled && (!entry || entry.state !== 'cached')) return null;

  if (!entry || entry.state === 'missing') {
    const bytes = sizeFor(seedId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          bytes === undefined
            ? t('download.start')
            : t('download.startWithSize', { size: formatMegabytes(bytes, i18n.language) })
        }
        onPress={() => download(seedId)}
        className="flex-row items-center gap-2 rounded-chip px-2"
        style={{ minHeight: MinTouchTarget }}>
        <Icon name="download" size={17} color="brand" />
        <Text variant="caption" weight="bold" color="brand">
          {t('download.start')}
        </Text>
      </Pressable>
    );
  }

  if (entry.state === 'downloading') {
    const percent = Math.round((entry.downloadedBytes / entry.bytes) * 100);
    return (
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('download.progressA11y', { percent })}
        className="min-w-0 flex-1"
        style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
        <Text variant="caption" weight="bold" className="mb-1">
          {t('download.inProgress')}
        </Text>
        <View className="h-1 overflow-hidden rounded-[2px] bg-track">
          <View className="h-full rounded-[2px] bg-brand" style={{ width: `${percent}%` }} />
        </View>
        <Text variant="caption" color="secondary" className="mt-1">
          {t('download.bytes', {
            done: formatMegabytes(entry.downloadedBytes, i18n.language),
            total: formatMegabytes(entry.bytes, i18n.language),
          })}
        </Text>
      </View>
    );
  }

  if (entry.state === 'corrupt') {
    return (
      <View className="min-w-0 flex-1">
        <View className="mb-1 flex-row items-center gap-2">
          <Icon name="alert" size={15} color="errorInk" />
          <Text variant="caption" weight="bold" color="error">
            {t('download.corrupt')}
          </Text>
        </View>
        <Text variant="caption" color="secondary" className="mb-1">
          {t('download.corruptBody')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => retry(seedId)}
          style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
          <Text variant="caption" weight="bold" color="brand">
            {t('download.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2" style={{ minHeight: MinTouchTarget }}>
      <Icon name="check" size={15} color="brand" />
      <Text variant="caption" weight="bold" color="brand">
        {t('download.done')}
      </Text>
      <Text variant="caption" color="secondary">
        {formatMegabytes(entry.bytes, i18n.language)}
      </Text>
    </View>
  );
}
