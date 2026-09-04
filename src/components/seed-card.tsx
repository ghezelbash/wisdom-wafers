import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { ProgressRing } from '@/components/progress-ring';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { getTopic, topicLabel } from '@/data/topics';
import type { ReasonCode } from '@/domain/recommendation/rank';
import { formatMegabytes } from '@/lib/format-bytes';
import { localizeDigits } from '@/lib/format';
import { useImpression, type ImpressionPlacement } from '@/platform/analytics/impression';
import type { Seed } from '@/models/seed';

/**
 * The content card, in its six variants.
 *
 * Anatomy is always the same: topic chip → title → learning promise →
 * format/duration/difficulty → recommendation reason → progress or download
 * state → CTA. Metadata never sits over the illustration, and the illustration
 * is never the only way to tell two cards apart — which is what lets the card
 * read correctly while art is still uncommissioned.
 */
export type SeedCardVariant = 'hero' | 'rail' | 'continue' | 'list' | 'review' | 'skeleton';

/** The ranker's own vocabulary (`src/domain/recommendation/rank.ts`). If
 *  ranking cannot explain a pick, the row is omitted — never invented. */
export type { ReasonCode } from '@/domain/recommendation/rank';

const chipStyles = {
  sciences: { surface: 'bg-brand-tint', color: 'brand' },
  humanities: { surface: 'bg-plum-tint', color: 'plum' },
  practical: { surface: 'bg-sun-tint', color: 'sun' },
} as const;

export function TopicChip({ topicId }: { topicId: string }) {
  const { t } = useTranslation();
  const topic = getTopic(topicId);
  const chip = chipStyles[topic?.family ?? 'sciences'];

  return (
    <View className={`shrink-0 rounded-chip px-[9px] py-[5px] ${chip.surface}`}>
      <Text variant="caption" weight="bold" color={chip.color} style={{ fontSize: 11.5 }}>
        {topicLabel(topic, t)}
      </Text>
    </View>
  );
}

function Meta({ seed }: { seed: Seed }) {
  const { t, i18n } = useTranslation();
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="caption" color="secondary">
        {t('seed.minutes', { count: localizeDigits(seed.estimatedMinutes, i18n.language) })}
      </Text>
      <MetaDot />
      <Text variant="caption" color="secondary">
        {t(`seed.level.${seed.difficulty}`)}
      </Text>
    </View>
  );
}

export interface SeedCardProps {
  variant: SeedCardVariant;
  seed?: Seed;
  onPress?: () => void;
  /** 0–1, for the continue variant. */
  progress?: number;
  minutesLeft?: number;
  reason?: { code: ReasonCode; topicId?: string };
  /** Review interval in days, for the review variant. */
  intervalDays?: number;
  dueLabel?: string;
  /** Set on the list variant when the seed is finished. */
  completed?: boolean;
  /**
   * Where this card is being shown, and at what position. Given together: a
   * rank without a placement compares nothing. Omitting them means the card is
   * not counted — a skeleton, or a single card that is not part of a list.
   */
  placement?: ImpressionPlacement;
  rank?: number;
}

export function SeedCard(props: SeedCardProps) {
  const { t, i18n } = useTranslation();
  const { isOnline, entryFor } = useCatalog();

  // Before the skeleton's early return, so the hook count never changes.
  useImpression(
    props.seed && props.placement && props.rank
      ? {
          seedId: props.seed.id,
          revision: props.seed.revision,
          placement: props.placement,
          rank: props.rank,
          reasonCode: props.reason?.code,
        }
      : null
  );

  if (props.variant === 'skeleton' || !props.seed) {
    // Mirrors the loaded geometry exactly, so nothing shifts on swap.
    return (
      <View className="rounded-card border border-hairline bg-card p-4">
        <View className="mb-3 h-5 w-24 rounded-chip bg-track" />
        <View className="mb-2 h-5 w-full rounded-chip bg-track" />
        <View className="mb-3 h-5 w-2/3 rounded-chip bg-track" />
        <View className="h-4 w-32 rounded-chip bg-track" />
      </View>
    );
  }

  const seed = props.seed;
  const entry = entryFor(seed.id);
  const unavailableOffline = !isOnline && entry?.state !== 'cached';

  const reasonText = props.reason
    ? props.reason.code === 'interest' && props.reason.topicId
      ? t('reason.interest', { topic: topicLabel(getTopic(props.reason.topicId), t) })
      : t(`reason.${props.reason.code}`)
    : undefined;

  if (props.variant === 'continue') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onPress}
        className="mb-3 flex-row items-center gap-[14px] rounded-card border border-hairline bg-card p-4">
        <ProgressRing
          progress={props.progress ?? 0}
          label={`${localizeDigits(Math.round((props.progress ?? 0) * 100), i18n.language)}٪`}
          accessibilityLabel={t('home.continueProgressA11y', {
            percent: Math.round((props.progress ?? 0) * 100),
          })}
        />
        <View className="min-w-0 flex-1">
          <Text variant="caption" weight="bold" color="secondary" className="mb-1">
            {t('home.continueTitle')}
          </Text>
          <Text variant="bodySm" weight="bold" numberOfLines={1} className="mb-1">
            {seed.title}
          </Text>
          <View className="flex-row items-center gap-2">
            <TopicChip topicId={seed.topicId} />
            <Text variant="caption" color="secondary">
              {t('home.minutesLeft', {
                count: localizeDigits(props.minutesLeft ?? seed.estimatedMinutes, i18n.language),
              })}
            </Text>
          </View>
        </View>
        <View
          className="items-center justify-center rounded-card bg-brand"
          style={{ width: MinTouchTarget, height: MinTouchTarget }}>
          <Icon name="play" size={18} color="onBrand" />
        </View>
      </Pressable>
    );
  }

  if (props.variant === 'rail') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onPress}
        className="w-[230px] shrink-0 rounded-card border border-hairline bg-card p-4">
        <View className="mb-3 flex-row">
          <TopicChip topicId={seed.topicId} />
        </View>
        <Text variant="bodySm" weight="bold" numberOfLines={3} className="mb-2">
          {seed.title}
        </Text>
        <Meta seed={seed} />
      </Pressable>
    );
  }

  if (props.variant === 'list') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onPress}
        className="flex-row items-center gap-3 rounded-card border border-hairline bg-card p-4">
        <View
          className={`h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.75px] ${
            props.completed ? 'border-brand bg-brand' : 'border-strong'
          }`}>
          {props.completed ? <Icon name="check" size={14} color="onBrand" /> : null}
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodySm" weight="bold" numberOfLines={2} className="mb-1">
            {seed.title}
          </Text>
          {props.completed && props.dueLabel ? (
            <Text variant="caption" color="secondary">
              {props.dueLabel}
            </Text>
          ) : (
            <Meta seed={seed} />
          )}
        </View>
      </Pressable>
    );
  }

  if (props.variant === 'review') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={props.onPress}
        className="flex-row items-center gap-3 rounded-card border border-hairline bg-card p-4">
        <View className="shrink-0 rounded-chip bg-sun-tint px-2 py-1">
          <Text variant="caption" weight="bold" color="sun">
            {t('review.intervalBadge', {
              days: localizeDigits(props.intervalDays ?? 0, i18n.language),
            })}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodySm" weight="bold" numberOfLines={2}>
            {seed.title}
          </Text>
          {props.dueLabel ? (
            <Text variant="caption" color="secondary">
              {props.dueLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // hero
  return (
    <View className="overflow-hidden rounded-sheet border border-hairline bg-card">
      <View className="h-[118px] items-center justify-center border-b border-hairline bg-track">
        <Text variant="caption" color="secondary">
          {t('seed.illustration', { topic: topicLabel(getTopic(seed.topicId), t) })}
        </Text>
      </View>

      <View className="p-[18px]">
        <View className="mb-3 flex-row items-center gap-2">
          <TopicChip topicId={seed.topicId} />
          <Meta seed={seed} />
        </View>

        <Text variant="titleMd" className="mb-2">
          {seed.title}
        </Text>
        <Text variant="bodySm" color="secondary" className="mb-3">
          {seed.promise}
        </Text>

        {reasonText ? (
          <Text variant="caption" color="secondary" className="mb-3">
            {reasonText}
          </Text>
        ) : null}

        {/* Offline states availability per card rather than hiding what cannot
            load. */}
        {unavailableOffline ? (
          <View className="mb-3 flex-row items-center gap-2">
            <Icon name="alert" size={15} color="sunInk" />
            <Text variant="caption" weight="bold" color="sun">
              {t('home.unavailableOffline')}
            </Text>
          </View>
        ) : entry?.state === 'cached' ? (
          <View className="mb-3 flex-row items-center gap-2">
            <Icon name="check" size={15} color="brand" />
            <Text variant="caption" weight="bold" color="brand">
              {t('download.done')}
            </Text>
            <Text variant="caption" color="secondary">
              {formatMegabytes(entry.bytes, i18n.language)}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: unavailableOffline }}
          disabled={unavailableOffline}
          onPress={props.onPress}
          className="items-center justify-center rounded-card bg-brand"
          style={{ minHeight: 52, opacity: unavailableOffline ? 0.5 : 1 }}>
          <Text variant="bodySm" weight="bold" color="onBrand">
            {t('home.startSeed')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
