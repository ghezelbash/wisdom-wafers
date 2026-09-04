import React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import type { CalloutBlock } from '@/models/seed';

import type { BlockViewProps } from '../types';

/** Two tones. A misconception is marked as one — never left to read as fact. */
export function CalloutBlockView({ block }: BlockViewProps<CalloutBlock>) {
  const note = block.tone === 'note';

  return (
    <View
      className={`rounded-card border p-4 ${
        note ? 'border-hairline bg-brand-tint' : 'border-error bg-error-tint'
      }`}>
      <View className="mb-2 flex-row items-center gap-2">
        <Icon name={note ? 'info' : 'alert'} size={17} color={note ? 'brand' : 'errorInk'} />
        <Text variant="bodySm" weight="bold" color={note ? 'brand' : 'error'}>
          {block.title}
        </Text>
      </View>
      <Text variant="bodySm">{block.body}</Text>
    </View>
  );
}
