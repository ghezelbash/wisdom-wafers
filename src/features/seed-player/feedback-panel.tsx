import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FeedbackTone = 'correct' | 'incorrect' | 'partial';

/**
 * The panel under a graded question.
 *
 * `aria-live="polite"`, never assertive: assertive would cut off the option
 * label mid-read. Incorrect offers a retry and carries no shame language.
 */
export function FeedbackPanel({
  tone,
  title,
  explanation,
  onRetry,
  onSeeSource,
}: {
  tone: FeedbackTone;
  title: string;
  explanation?: string;
  onRetry?: () => void;
  onSeeSource?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const badge = {
    correct: { background: theme.brand, icon: 'check' as const, color: 'brand' as const },
    incorrect: { background: theme.error, icon: 'close' as const, color: 'error' as const },
    partial: { background: theme.sunInk, icon: 'minus' as const, color: 'sun' as const },
  }[tone];

  return (
    <View
      accessibilityLiveRegion="polite"
      className="rounded-[20px] border border-hairline bg-card p-4">
      <View className="mb-[10px] flex-row items-center gap-2">
        <View
          style={{
            width: 22,
            height: 22,
            flexShrink: 0,
            borderRadius: 11,
            backgroundColor: badge.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name={badge.icon} size={13} color={theme.card} />
        </View>
        <Text variant="bodySm" weight="bold" color={badge.color}>
          {title}
        </Text>
      </View>

      {explanation ? (
        <Text variant="bodySm" className="mb-3">
          {explanation}
        </Text>
      ) : null}

      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          className="flex-row items-center gap-[7px] border-t border-hairline pt-3"
          style={{ minHeight: MinTouchTarget }}>
          <Icon name="chevronBack" size={14} color="brand" />
          <Text variant="caption" weight="bold" color="brand">
            {t('player.retry')}
          </Text>
        </Pressable>
      ) : null}

      {onSeeSource ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.seeSource')}
          onPress={onSeeSource}
          className="flex-row items-center gap-[7px] border-t border-hairline pt-3"
          style={{ minHeight: MinTouchTarget }}>
          <Icon name="sources" size={14} color="brand" />
          <Text variant="caption" weight="bold" color="brand">
            {t('player.seeSource')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
