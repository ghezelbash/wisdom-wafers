import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import type { RichTextBlock } from '@/models/seed';

import type { BlockViewProps } from '../types';

/** The reading default: 17/30, one meaningful block per viewport. */
export function RichTextBlockView({ block }: BlockViewProps<RichTextBlock>) {
  return (
    <View>
      {block.eyebrow ? (
        <Text variant="caption" weight="bold" color="sun" className="mb-4">
          {block.eyebrow}
        </Text>
      ) : null}
      {block.heading ? (
        <Text variant="titleLg" className="mb-[18px]" style={{ fontSize: 24, lineHeight: 36 }}>
          {block.heading}
        </Text>
      ) : null}
      {block.paragraphs.map((paragraph, index) => (
        <Text
          key={index}
          variant="body"
          color={index === 0 ? 'primary' : 'secondary'}
          className="mb-4">
          {paragraph}
        </Text>
      ))}
    </View>
  );
}
