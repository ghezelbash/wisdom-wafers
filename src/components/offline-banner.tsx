import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { Elevation } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { formatNumericDate } from '@/lib/date';

/**
 * Offline is a normal state, not an error.
 *
 * The banner says what is still true and when it was last true — a screen that
 * only says "offline" leaves the reader unable to judge what they are looking
 * at. One of the two places allowed to carry `e2`.
 */
export function OfflineBanner() {
  const { t, i18n } = useTranslation();
  const { isOnline, snapshot } = useCatalog();

  if (isOnline) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="mx-5 mb-3 flex-row items-center gap-3 rounded-card border border-hairline bg-card p-3"
      style={Elevation.e2}>
      <Icon name="alert" size={18} color="sunInk" />
      <View className="min-w-0 flex-1">
        <Text variant="caption" weight="bold">
          {t('offline.title')}
        </Text>
        <Text variant="caption" color="secondary">
          {snapshot.lastSyncedAt
            ? t('offline.lastSynced', {
                date: formatNumericDate(snapshot.lastSyncedAt, i18n.language),
              })
            : t('offline.neverSynced')}
        </Text>
      </View>
    </View>
  );
}
