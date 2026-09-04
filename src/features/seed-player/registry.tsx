import React from 'react';

import type { AnyBlock } from '@/models/seed';

import { CalloutBlockView } from './blocks/callout';
import { ImageBlockView } from './blocks/image';
import { MatchPairsBlockView } from './blocks/match-pairs';
import { MultiSelectBlockView } from './blocks/multi-select';
import { MultipleChoiceBlockView } from './blocks/multiple-choice';
import { OrderingBlockView } from './blocks/ordering';
import { QuoteBlockView } from './blocks/quote';
import { ReflectionBlockView } from './blocks/reflection';
import { RichTextBlockView } from './blocks/rich-text';
import { SummaryBlockView } from './blocks/summary';
import { TrueFalseBlockView } from './blocks/true-false';
import { UnknownBlockView } from './blocks/unknown';
import type { BlockViewProps } from './types';

/**
 * Blocks render from a registry keyed by `block.type`.
 *
 * A type with no entry renders the named fallback — a missing key must never
 * throw. Adding a block type is one file plus one line here.
 */
const registry: Record<string, React.ComponentType<BlockViewProps<never>>> = {
  richText: RichTextBlockView,
  image: ImageBlockView,
  quote: QuoteBlockView,
  callout: CalloutBlockView,
  multipleChoice: MultipleChoiceBlockView,
  multiSelect: MultiSelectBlockView,
  trueFalse: TrueFalseBlockView,
  ordering: OrderingBlockView,
  matchPairs: MatchPairsBlockView,
  reflection: ReflectionBlockView,
  summary: SummaryBlockView,
} as unknown as Record<string, React.ComponentType<BlockViewProps<never>>>;

export function BlockRenderer(props: BlockViewProps<AnyBlock>) {
  const Component = registry[props.block.type] ?? UnknownBlockView;
  return <Component {...(props as BlockViewProps<never>)} />;
}

export const isBlockTypeKnown = (type: string) => type in registry;
