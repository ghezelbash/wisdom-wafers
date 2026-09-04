import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import { localizeDigits } from '@/lib/format';
import type { MultiSelectBlock } from '@/models/seed';

import { AnswerOption, type OptionState } from '../answer-option';
import { FeedbackPanel } from '../feedback-panel';
import { grade } from '../grade';
import type { BlockViewProps } from '../types';

/**
 * Partial credit is its own state: the missed-but-correct option takes a
 * dashed border and «جا افتاد», so hit / missed / wrong are three visually
 * distinct treatments rather than a rounded-down failure.
 */
export function MultiSelectBlockView({
  block,
  draft,
  setDraft,
  answer,
  onRetry,
  onOpenSources,
}: BlockViewProps<MultiSelectBlock>) {
  const { t, i18n } = useTranslation();
  const selected = draft.selected ?? [];
  const submitted = !!answer;
  const expected = block.options.filter((option) => option.isCorrect).length;

  const toggle = (optionId: string) =>
    setDraft({
      selected: selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    });

  const stateFor = (optionId: string, isCorrect: boolean): { state: OptionState; badge?: string } => {
    if (!submitted) {
      return { state: selected.includes(optionId) ? 'selected' : 'idle' };
    }
    const chosen = (answer.selected ?? []).includes(optionId);
    if (isCorrect && chosen) return { state: 'correct', badge: t('option.correct') };
    if (isCorrect && !chosen) return { state: 'missed', badge: t('option.missed') };
    if (!isCorrect && chosen) return { state: 'incorrect', badge: t('option.wrong') };
    return { state: 'dimmed' };
  };

  const result = submitted ? grade(block, { selected: answer.selected }) : null;

  return (
    <View>
      <View className="mb-[14px] flex-row">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.multiSelect')}
          </Text>
        </View>
      </View>

      <Text variant="titleMd" className="mb-2" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.question}
      </Text>
      <Text variant="caption" color="secondary" className="mb-[18px]">
        {t('player.multiSelectHint', { count: localizeDigits(expected, i18n.language) })}
      </Text>

      <View className="mb-[18px] gap-[10px]">
        {block.options.map((option) => {
          const { state, badge } = stateFor(option.id, option.isCorrect);
          return (
            <AnswerOption
              key={option.id}
              text={option.text}
              shape="square"
              state={state}
              badge={badge}
              disabled={submitted}
              onPress={() => toggle(option.id)}
            />
          );
        })}
      </View>

      {submitted && result ? (
        <FeedbackPanel
          tone={answer.correct ? 'correct' : result.partial ? 'partial' : 'incorrect'}
          title={
            answer.correct
              ? t('player.correct')
              : result.partial
                ? t('player.partial', {
                    hits: localizeDigits(result.hits ?? 0, i18n.language),
                    total: localizeDigits(result.expected ?? expected, i18n.language),
                  })
                : t('player.incorrect')
          }
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
