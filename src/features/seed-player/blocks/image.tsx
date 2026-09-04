import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { useCatalog } from '@/context/CatalogContext';
import { localizeDigits } from '@/lib/format';
import type { ImageBlock } from '@/models/seed';

import { isAssetMissing } from '../asset-state';
import type { BlockViewProps } from '../types';

const RATIO: Record<ImageBlock['aspect'], number> = {
  '4:5': 4 / 5,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
};

/**
 * The caption is content, and alt text is a publish gate — so the block states
 * that alt text exists rather than leaving a reader to wonder. No text is ever
 * baked into the image.
 */
export function ImageBlockView({ block, seed }: BlockViewProps<ImageBlock>) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();

  if (isAssetMissing(block, seed.id, catalog)) {
    const position = seed.blocks.findIndex((item) => item.id === block.id) + 1;
    return (
      <View className="rounded-card border border-hairline bg-card p-5">
        <View className="mb-3 flex-row items-center gap-2">
          <Icon name="alert" size={18} color="sunInk" />
          <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
            {t('offline.assetTitle')}
          </Text>
        </View>
        <Text variant="bodySm" color="secondary" className="mb-4">
          {t('offline.assetBody')}
        </Text>
        {/* The resume point is stated, so skipping is not a loss. */}
        <Text variant="caption" color="secondary">
          {t('offline.resumePoint', { block: localizeDigits(position, i18n.language) })}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View
        className="mb-4 overflow-hidden rounded-card border border-hairline bg-track"
        style={{ aspectRatio: RATIO[block.aspect] }}>
        {block.imageUrl ? (
          <Image
            source={{ uri: block.imageUrl }}
            accessibilityLabel={block.alt}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Text variant="caption" color="secondary" className="text-center">
              {block.alt}
            </Text>
          </View>
        )}
      </View>

      {block.caption ? (
        <Text variant="bodySm" className="mb-3">
          {block.caption}
        </Text>
      ) : null}

      <View className="flex-row items-center gap-2">
        <Icon name="info" size={15} color="textSecondary" />
        <Text variant="caption" color="secondary">
          {t('player.image.altRecorded')}
        </Text>
      </View>
    </View>
  );
}
