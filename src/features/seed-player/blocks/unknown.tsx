import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import type { UnknownBlock } from '@/models/seed';

import type { BlockViewProps } from '../types';

/**
 * The fallback for a block type this build does not know.
 *
 * It names what happened, says progress is kept, and hands the reader a way
 * past it. The registry returns this instead of throwing, so one unrecognised
 * block can never cost a reader the rest of the seed.
 */
export function UnknownBlockView({ block }: BlockViewProps<UnknownBlock>) {
  const { t } = useTranslation();

  useEffect(() => {
    // Logged for the editorial team: which type, in which build.
    console.warn(`[seed-player] unknown block type "${block.type}" (id ${block.id})`);
  }, [block.id, block.type]);

  return (
    <View className="rounded-card border border-hairline bg-card p-5">
      <View className="mb-3 flex-row items-center gap-2">
        <Icon name="info" size={18} color="sunInk" />
        <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
          {t('player.unknown.title')}
        </Text>
      </View>
      <Text variant="bodySm" color="secondary">
        {t('player.unknown.body')}
      </Text>
    </View>
  );
}
