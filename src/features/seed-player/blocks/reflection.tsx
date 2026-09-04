import React from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { Fonts } from '@/constants/theme';
import { localizeDigits } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';
import type { ReflectionBlock } from '@/models/seed';

import type { BlockViewProps } from '../types';

/** Optional, private, never scored, stored on-device only — and the block says
 *  all three, because a reader will not type honestly otherwise. */
export function ReflectionBlockView({
  block,
  reflection,
  onReflectionChange,
}: BlockViewProps<ReflectionBlock>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  return (
    <View>
      <View className="mb-[14px] flex-row">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.reflection')}
          </Text>
        </View>
      </View>

      <Text variant="titleMd" className="mb-2" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.prompt}
      </Text>
      <Text variant="caption" color="secondary" className="mb-4">
        {t('player.reflection.note')}
      </Text>

      <TextInput
        multiline
        value={reflection}
        onChangeText={(text) => onReflectionChange(text.slice(0, block.maxLength))}
        placeholderTextColor={theme.textSecondary}
        className="rounded-card border border-hairline bg-card p-4"
        style={{
          minHeight: 140,
          color: theme.textPrimary,
          fontFamily: Fonts.sans,
          fontSize: 15,
          lineHeight: 26,
          textAlignVertical: 'top',
        }}
      />

      <View className="mt-3 flex-row items-center justify-between">
        <Text variant="caption" color="secondary">
          {t('player.reflection.counter', {
            count: localizeDigits(reflection.length, i18n.language),
            max: localizeDigits(block.maxLength, i18n.language),
          })}
        </Text>
        <View className="flex-row items-center gap-[6px]">
          <Icon name="lock" size={14} color="textSecondary" />
          <Text variant="caption" color="secondary">
            {t('player.reflection.private')}
          </Text>
        </View>
      </View>
    </View>
  );
}
