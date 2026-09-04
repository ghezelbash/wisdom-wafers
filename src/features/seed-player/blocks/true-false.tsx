import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import type { TrueFalseBlock } from '@/models/seed';

import { AnswerOption, type OptionState } from '../answer-option';
import { FeedbackPanel } from '../feedback-panel';
import type { BlockViewProps } from '../types';

/** Two labelled buttons, not a toggle: each option is a control with an
 *  explicit name, so a screen reader announces «درست» or «غلط» rather than a
 *  shape with no label. */
export function TrueFalseBlockView({
  block,
  draft,
  setDraft,
  answer,
  onRetry,
  onOpenSources,
}: BlockViewProps<TrueFalseBlock>) {
  const { t } = useTranslation();
  const submitted = !!answer;

  const stateFor = (value: boolean): { state: OptionState; badge?: string } => {
    if (!submitted) return { state: draft.bool === value ? 'selected' : 'idle' };
    if (value === block.answer) return { state: 'correct', badge: t('option.correct') };
    if (answer.answeredBool === value) return { state: 'incorrect', badge: t('option.yourAnswer') };
    return { state: 'dimmed' };
  };

  return (
    <View>
      <View className="mb-[14px] flex-row">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.trueFalse')}
          </Text>
        </View>
      </View>

      <Text variant="titleMd" className="mb-[18px]" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.statement}
      </Text>

      <View className="mb-5 gap-[10px]">
        {[true, false].map((value) => {
          const { state, badge } = stateFor(value);
          return (
            <AnswerOption
              key={String(value)}
              text={value ? t('player.true') : t('player.false')}
              state={state}
              badge={badge}
              disabled={submitted}
              onPress={() => setDraft({ bool: value })}
            />
          );
        })}
      </View>

      {submitted ? (
        <FeedbackPanel
          tone={answer.correct ? 'correct' : 'incorrect'}
          title={answer.correct ? t('player.correct') : t('player.incorrect')}
          explanation={block.explanation}
          onRetry={answer.correct ? undefined : onRetry}
          onSeeSource={
            answer.correct && block.sourceId ? () => onOpenSources(block.sourceId) : undefined
          }
        />
      ) : null}
    </View>
  );
}
