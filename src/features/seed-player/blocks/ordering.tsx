import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { localizeDigits } from '@/lib/format';
import type { OrderingBlock } from '@/models/seed';

import { FeedbackPanel } from '../feedback-panel';
import { scramble } from '../grade';
import type { BlockViewProps } from '../types';

/**
 * Ordering ships a non-drag path: 44×44 arrow buttons are the equal
 * affordance, not a fallback. On the first and last row the impossible
 * direction is disabled rather than hidden, so the row keeps its shape.
 */
export function OrderingBlockView({
  block,
  draft,
  setDraft,
  answer,
  onRetry,
}: BlockViewProps<OrderingBlock>) {
  const { t, i18n } = useTranslation();
  const submitted = !!answer;

  const initial = useMemo(
    () => scramble(block.items, block.id, (item) => item.id).map((item) => item.id),
    [block]
  );
  const order = draft.order ?? answer?.order ?? initial;
  const byId = useMemo(
    () => Object.fromEntries(block.items.map((item) => [item.id, item])),
    [block.items]
  );

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ order: next });
  };

  return (
    <View>
      <View className="mb-[14px] flex-row">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.ordering')}
          </Text>
        </View>
      </View>

      <Text variant="titleMd" className="mb-2" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.prompt}
      </Text>
      <Text variant="caption" color="secondary" className="mb-[18px]">
        {t('player.ordering.hint')}
      </Text>

      <View className="mb-5 gap-[10px]">
        {order.map((id, index) => {
          const inPlace = submitted && block.items[index]?.id === id;
          return (
            <View
              key={id}
              className={`flex-row items-center gap-3 rounded-[18px] border-[1.5px] p-3 ${
                submitted
                  ? inPlace
                    ? 'border-2 border-brand bg-brand-tint'
                    : 'border-2 border-error bg-error-tint'
                  : 'border-hairline bg-card'
              }`}>
              <View className="h-7 w-7 shrink-0 items-center justify-center rounded-chip bg-track">
                <Text variant="caption" weight="bold">
                  {localizeDigits(index + 1, i18n.language)}
                </Text>
              </View>

              <Text variant="bodySm" weight="semibold" className="min-w-0 flex-1">
                {byId[id]?.text}
              </Text>

              {submitted ? (
                <Text variant="caption" weight="bold" color={inPlace ? 'brand' : 'error'}>
                  {inPlace ? t('option.correct') : t('option.misplaced')}
                </Text>
              ) : (
                <View className="shrink-0 flex-row">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('player.ordering.moveUp')}
                    accessibilityState={{ disabled: index === 0 }}
                    disabled={index === 0}
                    onPress={() => move(index, -1)}
                    className="items-center justify-center"
                    style={{ width: MinTouchTarget, height: MinTouchTarget, opacity: index === 0 ? 0.35 : 1 }}>
                    <Icon name="chevronUp" size={18} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('player.ordering.moveDown')}
                    accessibilityState={{ disabled: index === order.length - 1 }}
                    disabled={index === order.length - 1}
                    onPress={() => move(index, 1)}
                    className="items-center justify-center"
                    style={{
                      width: MinTouchTarget,
                      height: MinTouchTarget,
                      opacity: index === order.length - 1 ? 0.35 : 1,
                    }}>
                    <Icon name="chevronDown" size={18} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {submitted ? (
        <FeedbackPanel
          tone={answer.correct ? 'correct' : answer.partial ? 'partial' : 'incorrect'}
          title={answer.correct ? t('player.correct') : t('player.incorrect')}
          explanation={block.explanation}
          onRetry={answer.correct ? undefined : onRetry}
        />
      ) : null}
    </View>
  );
}
