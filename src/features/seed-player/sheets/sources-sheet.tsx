import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { formatNumericDate, formatSourceYear } from '@/lib/date';
import { localizeDigits } from '@/lib/format';
import type { Seed } from '@/models/seed';

/**
 * Sources are one tap from any block.
 *
 * Each carries publisher, date and type, with a last-reviewed date for the
 * seed itself. Latin titles and publishers are LTR-isolated; a Persian
 * publisher stays RTL. Foreign years carry an era marker.
 */
export function SourcesSheet({
  seed,
  visible,
  highlightId,
  onClose,
  onReport,
}: {
  seed: Seed;
  visible: boolean;
  highlightId?: string;
  onClose: () => void;
  onReport: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('common.close')}>
      <View className="px-5 pb-2 pt-4">
        <View className="mb-1 flex-row items-center gap-2">
          <Text variant="titleMd" className="min-w-0 flex-1">
            {t('sources.title')}
          </Text>
          <Text variant="caption" color="secondary">
            {t('sources.count', { count: localizeDigits(seed.sources.length, i18n.language) })}
          </Text>
        </View>
        <Text variant="caption" color="secondary">
          {t('sources.lastReviewed', {
            date: formatNumericDate(seed.lastReviewedAt, i18n.language),
            by: seed.reviewedBy,
          })}
        </Text>
      </View>

      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
        {seed.sources.length === 0 ? (
          <Text variant="bodySm" color="secondary">
            {t('sources.empty')}
          </Text>
        ) : (
          <View className="gap-3">
            {seed.sources.map((source) => (
              <View
                key={source.id}
                className={`rounded-card border bg-card p-4 ${
                  source.id === highlightId ? 'border-brand' : 'border-hairline'
                }`}>
                <View className="mb-2 flex-row items-center gap-2">
                  <Text variant="caption" weight="bold" color="brand">
                    {source.kind}
                  </Text>
                  <MetaDot />
                  <Text variant="caption" color="secondary">
                    {formatSourceYear(source.year, source.era, i18n.language)}
                  </Text>
                </View>
                <Text variant="bodySm" weight="bold" ltr={source.latin} className="mb-1">
                  {source.title}
                </Text>
                <Text variant="caption" color="secondary" ltr={source.latin}>
                  {source.publisher}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Reporting an error is a normal action in the same sheet stack, not a
          settings item. */}
      <Pressable
        accessibilityRole="button"
        onPress={onReport}
        className="mx-5 mb-2 flex-row items-center gap-2 border-t border-hairline pt-4"
        style={{ minHeight: MinTouchTarget }}>
        <Icon name="alert" size={16} color="errorInk" />
        <Text variant="bodySm" weight="bold" color="error">
          {t('sources.report')}
        </Text>
      </Pressable>
    </Sheet>
  );
}
