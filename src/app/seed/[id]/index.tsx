import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/Text';
import { Motion } from '@/constants/theme';
import { content } from '@/data/content-repository';
import { useCatalog } from '@/context/CatalogContext';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { loadProgress, saveProgress, type SeedProgress } from '@/lib/progress-store';
import { useIdentity } from '@/context/AuthContext';
import { recordCompletion, recordContentReport, recordPosition } from '@/domain/progress/events';
import { pushSaved, savedEntry } from '@/domain/account/push';
import { setAnalyticsContext, track } from '@/platform/analytics';
import { ASSESSED_TYPES, isKnownBlock, type AnyBlock, type SeedBlock } from '@/models/seed';

import { BlockRenderer } from '@/features/seed-player/registry';
import { PlayerHeader } from '@/features/seed-player/player-header';
import { ReportSheet } from '@/features/seed-player/sheets/report-sheet';
import { SourcesSheet } from '@/features/seed-player/sheets/sources-sheet';
import { grade, toAnswer } from '@/features/seed-player/grade';
import { isAssetMissing } from '@/features/seed-player/asset-state';
import type { Draft } from '@/features/seed-player/types';

/** Whether the reader has given enough for this block to be graded. */
function draftComplete(block: AnyBlock, draft: Draft): boolean {
  switch (block.type) {
    case 'multipleChoice':
      return (draft.selected?.length ?? 0) === 1;
    case 'multiSelect':
      return (draft.selected?.length ?? 0) > 0;
    case 'trueFalse':
      return draft.bool !== undefined;
    case 'ordering':
      return true;
    case 'matchPairs':
      return Object.keys(draft.pairs ?? {}).length === (block as any).pairs.length;
    default:
      return true;
  }
}

const SUBMIT_LABEL: Record<string, string> = {
  multipleChoice: 'player.chooseOne',
  multiSelect: 'player.chooseAny',
  trueFalse: 'player.choosePosition',
  ordering: 'player.confirmOrder',
  matchPairs: 'player.confirmPairs',
};

/**
 * The seed player.
 *
 * A full-screen flow outside the tabs: while you are in a seed, there is
 * nowhere else to be. Every block change is written through, so closing is
 * free and needs no confirmation.
 */
export default function SeedPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const catalog = useCatalog();
  const { identity } = useIdentity();

  const seed = useMemo(() => content.getSeed(id), [id]);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [sheet, setSheet] = useState<'none' | 'sources' | 'report'>('none');
  const [highlightSource, setHighlightSource] = useState<string | undefined>();

  const [fade] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const scroller = useRef<ScrollView>(null);
  // When this reader opened the seed, so the completion reports a real
  // duration rather than a zero that makes the funnel meaningless. Set in the
  // effect below rather than at construction: reading the clock during render
  // is impure, and the effect is also where a change of seed resets it.
  const openedAt = useRef(0);

  useEffect(() => {
    if (!seed) return;
    let cancelled = false;
    openedAt.current = Date.now();

    // Context rides along on every later event and on any error report.
    setAnalyticsContext({ route: '/seed', seed_id: seed.id, revision: seed.revision });
    track('seed_started', {
      seed_id: seed.id,
      revision: seed.revision,
      source: 'direct',
      online: catalog.isOnline,
    });

    loadProgress(seed.id, seed.revision).then((stored) => {
      if (!cancelled) setProgress(stored);
    });
    return () => {
      cancelled = true;
    };
    // Started once per seed, not once per connectivity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const persist = useCallback((next: SeedProgress) => {
    setProgress(next);
    saveProgress(next);
  }, []);

  const animateToBlock = useCallback(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
    if (reduced) {
      // Cross-fade only: no translation, and half the duration.
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: Motion.reducedDuration.blockChange,
        useNativeDriver: true,
      }).start();
      return;
    }
    fade.setValue(0);
    shift.setValue(12);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: Motion.duration.blockChange,
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: 0,
        duration: Motion.duration.blockChange,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, shift, reduced]);

  if (!seed) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas px-6">
        <Text variant="titleMd" className="mb-2 text-center">
          {t('player.notFound')}
        </Text>
        <Text variant="bodySm" color="secondary" className="mb-6 text-center">
          {t('player.notFoundBody')}
        </Text>
        <Button label={t('player.goBack')} onPress={() => router.replace('/(tabs)')} />
      </SafeAreaView>
    );
  }

  if (!progress) {
    // Reading stored progress; the chrome is already correct, so nothing shifts
    // when the block arrives.
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <PlayerHeader
          title={seed.title}
          blockIndex={0}
          blockCount={seed.blocks.length}
          saved={false}
          onClose={() => router.back()}
          onToggleSave={() => {}}
          onMore={() => {}}
        />
        <View className="flex-1 px-6 pt-6">
          <View className="h-6 w-2/3 rounded-chip bg-track" />
          <View className="mt-4 h-4 w-full rounded-chip bg-track" />
          <View className="mt-2 h-4 w-5/6 rounded-chip bg-track" />
        </View>
      </SafeAreaView>
    );
  }

  const index = Math.min(progress.blockIndex, seed.blocks.length - 1);
  const block = seed.blocks[index];
  const answer = progress.answers[block.id];
  const assessed = ASSESSED_TYPES.has(block.type) && isKnownBlock(block);
  const isLast = index === seed.blocks.length - 1;
  const assetMissing = isAssetMissing(block, seed.id, catalog);

  const submit = () => {
    if (!isKnownBlock(block)) return;
    const result = grade(block as SeedBlock, draft);
    track('answer_submitted', {
      seed_id: seed.id,
      block_type: block.type,
      correct: result.correct,
      partial: result.partial,
      attempt_no: (answer?.attempts ?? 0) + 1,
    });
    persist({
      ...progress,
      answers: {
        ...progress.answers,
        [block.id]: toAnswer(block.id, draft, result, (answer?.attempts ?? 0) + 1),
      },
    });
  };

  const retry = () => {
    const answers = { ...progress.answers };
    delete answers[block.id];
    persist({ ...progress, answers });
    setDraft({});
  };

  const advance = () => {
    track('block_completed', { seed_id: seed.id, block_type: block.type, ordinal: index + 1 });

    if (isLast) {
      const completedAt = new Date().toISOString();
      track('seed_completed', {
        seed_id: seed.id,
        duration_ms: openedAt.current ? Date.now() - openedAt.current : 0,
        interaction_count: Object.keys(progress.answers).length,
      });
      // Written through first: the local record is what the reader sees, and it
      // must survive even if queueing throws.
      persist({ ...progress, completedAt });
      // Queued rather than sent: being offline must never cost a completion.
      if (identity) {
        void recordCompletion({
          uid: identity.uid,
          seedId: seed.id,
          revision: seed.revision,
          occurredAt: completedAt,
        });
      }
      router.replace(`/seed/${seed.id}/complete`);
      return;
    }
    const next = index + 1;
    persist({ ...progress, blockIndex: next });

    // Only when this is further than the reader has been: moving back and forth
    // inside a seed says nothing new about where they got to, and the queue
    // should carry facts rather than navigation.
    if (identity && next > (progress.blockIndex ?? 0)) {
      void recordPosition({
        uid: identity.uid,
        seedId: seed.id,
        revision: seed.revision,
        blockIndex: next,
      });
    }

    setDraft({});
    animateToBlock();
  };

  const primary =
    assessed && !answer
      ? {
          label: t(SUBMIT_LABEL[block.type] ?? 'common.continue'),
          disabled: !draftComplete(block, draft),
          onPress: submit,
        }
      : {
          label: isLast
            ? t('player.summary.finish')
            : assetMissing
              ? t('offline.skipAndContinue')
              : t('common.continue'),
          disabled: false,
          onPress: advance,
        };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <PlayerHeader
        title={seed.title}
        blockIndex={index}
        blockCount={seed.blocks.length}
        saved={!!progress.saved}
        onClose={() => router.replace('/(tabs)')}
        onToggleSave={() => {
          const saved = !progress.saved;
          persist({ ...progress, saved });
          // Local first; the account hears about it if there is one.
          void pushSaved(
            { uid: identity?.uid ?? null, isAccount: identity?.source === 'account' },
            [savedEntry(seed.id, saved)]
          );
        }}
        onMore={() => setSheet('sources')}
      />

      <ScrollView
        ref={scroller}
        className="min-w-0 flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 }}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: shift }] }}>
          <BlockRenderer
            block={block}
            seed={seed}
            draft={draft}
            setDraft={setDraft}
            answer={answer}
            onRetry={retry}
            onOpenSources={(sourceId) => {
              setHighlightSource(sourceId);
              setSheet('sources');
            }}
            reflection={progress.reflection ?? ''}
            onReflectionChange={(text) => persist({ ...progress, reflection: text })}
          />
        </Animated.View>
      </ScrollView>

      {/* Pinned footer: at 200% type the button grows, and never leaves the
          viewport. */}
      <View className="px-6 pb-7 pt-4">
        {block.type === 'reflection' ? (
          <Button
            variant="ghost"
            label={t('player.reflection.skip')}
            onPress={advance}
            className="mb-2"
          />
        ) : null}
        <Button {...primary} />
      </View>

      <SourcesSheet
        seed={seed}
        visible={sheet === 'sources'}
        highlightId={highlightSource}
        onClose={() => setSheet('none')}
        onReport={() => setSheet('report')}
      />
      <ReportSheet
        visible={sheet === 'report'}
        onClose={() => setSheet('none')}
        onSubmit={(category, detail) => {
          if (!identity) return;
          void recordContentReport({
            uid: identity.uid,
            seedId: seed.id,
            revision: seed.revision,
            blockId: block.id,
            category,
            detail,
          });
        }}
      />
    </SafeAreaView>
  );
}
