import React from 'react';
import { View } from 'react-native';

import { MetaDot } from '@/components/meta-dot';
import { Text } from '@/components/Text';
import type { QuoteBlock } from '@/models/seed';

import type { BlockViewProps } from '../types';

export function QuoteBlockView({ block }: BlockViewProps<QuoteBlock>) {
  return (
    <View className="rounded-card border-s-[3px] border-brand bg-card px-5 py-5">
      <Text variant="titleMd" className="mb-4" style={{ fontSize: 19, lineHeight: 32 }}>
        {block.text}
      </Text>
      <View className="flex-row items-center gap-2">
        {block.attribution ? (
          <Text variant="caption" color="secondary">
            {block.attribution}
          </Text>
        ) : null}
        {block.attribution && block.period ? <MetaDot /> : null}
        {block.period ? (
          <Text variant="caption" color="secondary">
            {block.period}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
