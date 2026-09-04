import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import type { MultipleChoiceBlock } from '@/models/seed';

import { AnswerOption, type OptionState } from '../answer-option';
import { FeedbackPanel } from '../feedback-panel';
import type { BlockViewProps } from '../types';

export function MultipleChoiceBlockView({
  block,
  draft,
  setDraft,
  answer,
  onRetry,
  onOpenSources,
}: BlockViewProps<MultipleChoiceBlock>) {
  const { t } = useTranslation();
  const picked = draft.selected?.[0];
  const submitted = !!answer;

  const stateFor = (optionId: string, isCorrect: boolean): { state: OptionState; badge?: string } => {
    if (!submitted) {
      return { state: picked === optionId ? 'selected' : 'idle' };
    }
    if (isCorrect) return { state: 'correct', badge: t('option.correct') };
    if (picked === optionId) return { state: 'incorrect', badge: t('option.yourAnswer') };
    // Rejected options stay legible; the reader needs to see what they turned down.
    return { state: 'dimmed' };
  };

  return (
    <View>
      <View className="mb-[14px] flex-row">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.multipleChoice')}
          </Text>
        </View>
      </View>

      <Text variant="titleMd" className="mb-[18px]" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.question}
      </Text>

      <View className="mb-5 gap-[10px]">
        {block.options.map((option) => {
          const { state, badge } = stateFor(option.id, option.isCorrect);
          return (
            <AnswerOption
              key={option.id}
              text={option.text}
              state={state}
              badge={badge}
              disabled={submitted}
              onPress={() => setDraft({ selected: [option.id] })}
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
