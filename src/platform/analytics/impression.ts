import { useEffect } from 'react';

import { track } from '@/platform/analytics';
import type { EventMap } from '@/platform/analytics/events';

/**
 * Counting a card once.
 *
 * `seed_impression` was declared and never sent, which made every
 * denominator in the ranking work unavailable: a card's click-through, a
 * reason code's usefulness, and the saturation penalty all need to know how
 * often something was *shown*.
 *
 * ### What this measures, precisely
 *
 * A card **rendered into a list the reader opened** — not a card verified to
 * have crossed the viewport. The home and topic screens are `ScrollView`s, and
 * a `ScrollView` has no viewability callback; getting a true viewport signal
 * means moving those lists to `FlatList` with `onViewableItemsChanged`, which
 * is a change to five screens' scrolling behaviour and not something to do
 * inside a telemetry change.
 *
 * So the number is an upper bound: cards below the fold of a vertical list are
 * counted. The rails are horizontal and finite, so the bias is bounded and in
 * one direction, which is the property that makes a metric still usable. It is
 * written down here and in `docs/runbooks/observability.md` rather than left
 * for someone to discover from a ratio that never quite makes sense.
 *
 * ### Once per placement per launch
 *
 * A re-render, a tab switch, or scrolling back up must not count again — an
 * impression that inflates with restlessness measures the reader's scrolling,
 * not the card. The same seed in two different placements is two impressions,
 * because that is the comparison the placement parameter exists to make.
 */

const seen = new Set<string>();

/** Used by tests, and by anything that starts a genuinely new session. */
export function __resetImpressions() {
  seen.clear();
}

export type ImpressionPlacement = EventMap['seed_impression']['placement'];

export interface Impression {
  seedId: string;
  revision: number;
  placement: ImpressionPlacement;
  /** Position within its list, from 1. Its whole purpose is order effects. */
  rank: number;
  reasonCode?: string;
}

export function recordImpression(impression: Impression | null): void {
  if (!impression) return;

  const key = `${impression.seedId}@${impression.placement}`;
  if (seen.has(key)) return;
  seen.add(key);

  track('seed_impression', {
    seed_id: impression.seedId,
    revision: impression.revision,
    placement: impression.placement,
    rank: impression.rank,
    ...(impression.reasonCode ? { reason_code: impression.reasonCode } : {}),
  });
}

/**
 * The hook form, for a card that renders itself.
 *
 * Takes null so it can be called unconditionally from a component that
 * sometimes has no seed — a skeleton — without breaking the rules of hooks.
 */
export function useImpression(impression: Impression | null): void {
  const key = impression ? `${impression.seedId}@${impression.placement}` : null;

  useEffect(() => {
    recordImpression(impression);
    // Keyed on the identity of the impression, not the object: the caller
    // builds a fresh one on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
