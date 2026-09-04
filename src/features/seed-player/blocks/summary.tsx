import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import type { SummaryBlock } from '@/models/seed';
import { localizeDigits } from '@/lib/format';

import type { BlockViewProps } from '../types';

/**
 * Exactly three points, each written as a recallable claim — the scheduler
 * asks them separately on day three, which is why the block says so.
 */
export function SummaryBlockView({ block }: BlockViewProps<SummaryBlock>) {
  const { t, i18n } = useTranslation();

  return (
    <View>
      <Text variant="titleMd" className="mb-5">
        {t('player.summary.title')}
      </Text>

      <View className="mb-5 gap-3">
        {block.points.map((point, index) => (
          <View
            key={index}
            className="flex-row items-start gap-3 rounded-card border border-hairline bg-card p-4">
            <View className="h-7 w-7 shrink-0 items-center justify-center rounded-chip bg-brand-tint">
              <Text variant="caption" weight="bold" color="brand">
                {localizeDigits(index + 1, i18n.language)}
              </Text>
            </View>
            <Text variant="bodySm" className="min-w-0 flex-1">
              {point}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" color="secondary">
        {t('player.summary.note')}
      </Text>
    </View>
  );
}
