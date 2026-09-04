import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { localizeDigits } from '@/lib/format';
import type { MatchPairsBlock } from '@/models/seed';

import { FeedbackPanel } from '../feedback-panel';
import { scramble } from '../grade';
import type { BlockViewProps } from '../types';

/**
 * Tap a concept, then tap its description. No drag is required anywhere; drag
 * would be an enhancement, never the sole affordance.
 */
export function MatchPairsBlockView({
  block,
  draft,
  setDraft,
  answer,
  onRetry,
}: BlockViewProps<MatchPairsBlock>) {
  const { t, i18n } = useTranslation();
  const [activeConcept, setActiveConcept] = useState<string | null>(null);
  const submitted = !!answer;
  const pairs = draft.pairs ?? answer?.pairs ?? {};

  const descriptions = useMemo(
    () =>
      scramble(
        [...block.pairs.map((pair) => pair.description), ...(block.distractors ?? [])],
        block.id,
        (value) => value
      ),
    [block]
  );

  const takenBy = (description: string) =>
    Object.entries(pairs).find(([, value]) => value === description)?.[0];

  const choose = (description: string) => {
    if (!activeConcept) return;
    const next = { ...pairs };
    // A description belongs to one concept at a time.
    for (const [conceptId, value] of Object.entries(next)) {
      if (value === description) delete next[conceptId];
    }
    next[activeConcept] = description;
    setDraft({ pairs: next });
    setActiveConcept(null);
  };

  const done = Object.keys(pairs).length;
  const remaining = block.pairs.length - done;

  return (
    <View>
      <View className="mb-[14px] flex-row items-center gap-2">
        <View className="rounded-chip bg-brand-tint px-[9px] py-[5px]">
          <Text variant="caption" weight="bold" color="brand" style={{ fontSize: 11.5 }}>
            {t('player.badge.matchPairs')}
          </Text>
        </View>
        <Text variant="caption" color="secondary">
          {t('player.matchPairs.progress', {
            done: localizeDigits(done, i18n.language),
            total: localizeDigits(block.pairs.length, i18n.language),
          })}
        </Text>
      </View>

      <Text variant="titleMd" className="mb-2" style={{ fontSize: 19, lineHeight: 30 }}>
        {block.prompt}
      </Text>
      <Text variant="caption" color="secondary" className="mb-[18px]">
        {t('player.matchPairs.hint')}
      </Text>

      <View className="mb-4 gap-[10px]">
        {block.pairs.map((pair) => {
          const matched = pairs[pair.id];
          const active = activeConcept === pair.id;
          const right = submitted && matched === pair.description;
          return (
            <Pressable
              key={pair.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              disabled={submitted}
              onPress={() => setActiveConcept(active ? null : pair.id)}
              className={`rounded-[18px] border-[1.5px] p-3 ${
                submitted
                  ? right
                    ? 'border-2 border-brand bg-brand-tint'
                    : 'border-2 border-error bg-error-tint'
                  : active
                    ? 'border-2 border-brand bg-brand-tint'
                    : 'border-hairline bg-card'
              }`}>
              <View className="flex-row items-center gap-2">
                <Text variant="bodySm" weight="bold" className="min-w-0 flex-1">
                  {pair.concept}
                </Text>
                {submitted ? (
                  <Icon name={right ? 'check' : 'close'} size={16} color={right ? 'brand' : 'errorInk'} />
                ) : null}
              </View>
              <Text variant="caption" color={matched ? 'primary' : 'secondary'} className="mt-1">
                {matched ?? (active ? t('player.matchPairs.pickDescription') : '—')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!submitted ? (
        <View className="mb-5 gap-2">
          {descriptions.map((description) => {
            const owner = takenBy(description);
            return (
              <Pressable
                key={description}
                accessibilityRole="button"
                accessibilityState={{ disabled: !activeConcept || !!owner }}
                disabled={!activeConcept || !!owner}
                onPress={() => choose(description)}
                className={`rounded-input border-[1.5px] px-4 py-3 ${
                  owner ? 'border-hairline bg-card opacity-40' : 'border-hairline bg-card'
                }`}
                style={{ minHeight: 48 }}>
                <Text variant="caption">{description}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!submitted && remaining > 0 ? (
        <Text variant="caption" color="secondary" className="mb-3">
          {t('player.matchPairs.remaining', { count: localizeDigits(remaining, i18n.language) })}
        </Text>
      ) : null}

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
