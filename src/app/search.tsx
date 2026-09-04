import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { TopicChip } from '@/components/seed-card';
import { Text } from '@/components/Text';
import { Fonts, MinTouchTarget } from '@/constants/theme';
import { useCatalog } from '@/context/CatalogContext';
import { content } from '@/data/content-repository';
import { getTopic, INTEREST_TOPICS, topicLabel } from '@/data/topics';
import { useTheme } from '@/hooks/use-theme';
import { localizeDigits } from '@/lib/format';
import { analyseQuery, buildIndex, highlightParts, searchIndex } from '@/lib/search';
import { track } from '@/platform/analytics';
import { recordImpression } from '@/platform/analytics/impression';
import type { Seed } from '@/models/seed';

type Filter = 'all' | 'short' | 'intro' | 'downloaded';

/**
 * Search.
 *
 * A pushed screen, never a fifth tab. It runs against a local normalised index,
 * so it works offline, and it states what was matched whenever normalisation
 * changed the answer — otherwise a result nobody typed looks like a bug.
 */
export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { entryFor } = useCatalog();

  const [raw, setRaw] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const index = useMemo(
    () =>
      buildIndex(content.listSeeds(), (seed) => [
        seed.title,
        seed.promise,
        topicLabel(getTopic(seed.topicId), t),
      ]),
    [t]
  );

  const analysis = useMemo(() => analyseQuery(raw), [raw]);
  const results = useMemo(() => {
    const found = searchIndex(index, analysis);
    return found.filter((seed) => {
      if (filter === 'short') return seed.estimatedMinutes <= 5;
      if (filter === 'intro') return seed.difficulty === 'intro';
      if (filter === 'downloaded') return entryFor(seed.id)?.state === 'cached';
      return true;
    });
  }, [index, analysis, filter, entryFor]);

  // Only shapes, never the words: length and counts describe the query without
  // recording what anyone searched for.
  useEffect(() => {
    if (!analysis.normalized) return;
    const timer = setTimeout(() => {
      track('search_performed', {
        normalized_length: analysis.normalized.length,
        result_count: results.length,
        filter_count: filter === 'all' ? 0 : 1,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [analysis.normalized, results.length, filter]);

  /**
   * The results that were shown, on the same debounce as the search itself.
   *
   * Debounced for the same reason: typing produces a result list per keystroke,
   * and counting each one would say a seed was shown eight times for one query.
   */
  useEffect(() => {
    if (!analysis.normalized) return;

    const timer = setTimeout(() => {
      results.forEach((seed, position) =>
        recordImpression({
          seedId: seed.id,
          revision: seed.revision,
          placement: 'search',
          rank: position + 1,
        })
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [analysis.normalized, results]);

  const open = (seed: Seed) => router.push(`/seed/${seed.id}`);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-5 py-2">
        <View
          className="min-w-0 flex-1 flex-row items-center gap-2 rounded-input border border-hairline bg-card px-4"
          style={{ minHeight: MinTouchTarget + 4 }}>
          <Icon name="search" size={18} color="textSecondary" />
          <TextInput
            autoFocus
            value={raw}
            onChangeText={setRaw}
            placeholder={t('search.placeholder')}
            placeholderTextColor={theme.textSecondary}
            style={{
              flex: 1,
              color: theme.textPrimary,
              fontFamily: Fonts.sans,
              fontSize: 15,
              minWidth: 0,
              outlineWidth: 2,
              outlineColor: theme.brand,
              outlineOffset: 2,
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
          <Text variant="bodySm" weight="bold" color="brand">
            {t('search.cancel')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-[56px] flex-none"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center' }}>
        {(['all', 'short', 'intro', 'downloaded'] as Filter[]).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === id }}
            onPress={() => setFilter(id)}
            className={`rounded-chip border px-3 py-2 ${
              filter === id ? 'border-brand bg-brand-tint' : 'border-hairline bg-card'
            }`}>
            <Text variant="caption" weight="bold" color={filter === id ? 'brand' : 'secondary'}>
              {t(`search.filter.${id}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        {!raw ? null : results.length ? (
          <>
            {/* Normalisation is named only when it changed the answer. */}
            {analysis.expandedFrom ? (
              <Text variant="caption" color="secondary" className="mb-2">
                {t('search.expanded', {
                  from: analysis.expandedFrom,
                  to: analysis.expandedTo,
                })}
              </Text>
            ) : null}
            <Text variant="caption" color="secondary" className="mb-3">
              {t('search.resultCount', {
                count: localizeDigits(results.length, i18n.language),
              })}
            </Text>

            <View className="gap-3">
              {results.map((seed) => (
                <Pressable
                  key={seed.id}
                  accessibilityRole="button"
                  onPress={() => open(seed)}
                  className="rounded-card border border-hairline bg-card p-4">
                  <View className="mb-2 flex-row items-center gap-2">
                    <TopicChip topicId={seed.topicId} />
                    <Text variant="caption" color="secondary">
                      {t('seed.minutes', {
                        count: localizeDigits(seed.estimatedMinutes, i18n.language),
                      })}
                    </Text>
                  </View>
                  <Text variant="bodySm" weight="bold" className="mb-1">
                    {highlightParts(seed.title, analysis).map((part, partIndex) => (
                      <Text
                        key={partIndex}
                        variant="bodySm"
                        weight="bold"
                        color={part.hit ? 'brand' : 'primary'}>
                        {part.text}
                      </Text>
                    ))}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {seed.promise}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          // A no-result screen is a recovery screen, not a dead end.
          <View>
            <Text variant="titleMd" className="mb-2">
              {t('search.emptyTitle')}
            </Text>
            <Text variant="bodySm" color="secondary" className="mb-5">
              {t('search.emptyBody')}
            </Text>

            <Text variant="caption" weight="bold" color="secondary" className="mb-3">
              {t('search.nearest')}
            </Text>
            <View className="mb-6 flex-row flex-wrap gap-2">
              {INTEREST_TOPICS.slice(0, 4).map((topic) => (
                <Pressable
                  key={topic.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/topic/${topic.id}`)}
                  className="rounded-chip border border-hairline bg-card px-3 py-2"
                  style={{ minHeight: MinTouchTarget - 8 }}>
                  <Text variant="caption" weight="bold">
                    {topicLabel(topic, t)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="rounded-card border border-hairline bg-card p-4">
              <Text variant="bodySm" weight="bold" className="mb-1">
                {t('search.suggestTitle')}
              </Text>
              <Text variant="caption" color="secondary" className="mb-3">
                {t('search.suggestBody')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                className="items-center justify-center rounded-card bg-brand"
                style={{ minHeight: 48 }}>
                <Text variant="bodySm" weight="bold" color="onBrand">
                  {t('search.suggestCta')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {!raw ? (
          <Text variant="bodySm" color="secondary">
            {t('search.hint')}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
