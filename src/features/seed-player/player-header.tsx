import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { localizeDigits } from '@/lib/format';

/**
 * Player chrome, identical on every block.
 *
 * Progress is segmented and carries its text equivalent («۵ از ۱۱») — a fill
 * length is not a status a screen reader can read, and it announces blocks
 * rather than a percentage. Close comes first in focus order regardless of
 * which side it sits on: leaving must always be reachable first.
 */
export function PlayerHeader({
  title,
  blockIndex,
  blockCount,
  saved,
  onClose,
  onToggleSave,
  onMore,
}: {
  title: string;
  blockIndex: number;
  blockCount: number;
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onMore: () => void;
}) {
  const { t, i18n } = useTranslation();
  const current = blockIndex + 1;
  const progressLabel = t('player.progress', {
    current: localizeDigits(current, i18n.language),
    total: localizeDigits(blockCount, i18n.language),
  });

  return (
    <View className="flex-row items-center gap-1 px-3" style={{ height: 56 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('player.close')}
        onPress={onClose}
        className="items-center justify-center"
        style={{ width: MinTouchTarget, height: MinTouchTarget }}>
        <Icon name="close" size={19} />
      </Pressable>

      <View className="min-w-0 flex-1 px-1">
        <Text variant="caption" weight="bold" numberOfLines={1} className="mb-[6px]">
          {title}
        </Text>
        <View className="flex-row items-center gap-[7px]">
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={progressLabel}
            className="flex-1 flex-row gap-[3px]">
            {Array.from({ length: blockCount }).map((_, index) => (
              <View
                key={index}
                className={`h-1 flex-1 rounded-[2px] ${index < current ? 'bg-brand' : 'bg-track'}`}
              />
            ))}
          </View>
          <Text variant="caption" weight="bold" color="secondary" style={{ fontSize: 11.5 }}>
            {progressLabel}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('player.save')}
        accessibilityState={{ selected: saved }}
        onPress={onToggleSave}
        className="items-center justify-center"
        style={{ width: MinTouchTarget, height: MinTouchTarget }}>
        <Icon name="bookmark" size={19} color={saved ? 'brand' : 'textPrimary'} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('player.more')}
        onPress={onMore}
        className="items-center justify-center"
        style={{ width: MinTouchTarget, height: MinTouchTarget }}>
        <Icon name="more" size={19} />
      </Pressable>
    </View>
  );
}
