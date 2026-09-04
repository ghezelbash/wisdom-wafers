import type { TopicFamilyName } from '@/constants/theme';

/**
 * Topics.
 *
 * A topic resolves to one of three accent families; six distinct hues would
 * collide with the correct / incorrect / offline semantics. Names offered at
 * first launch come from the locale catalogue (`labelKey`) because they have to
 * work under `en` too; catalogue-only topics carry their Persian title as data
 * until the content service serves localised names.
 */
export interface Topic {
  id: string;
  family: TopicFamilyName;
  labelKey?: string;
  title?: string;
}

export const TOPICS: Topic[] = [
  { id: 'astronomy', labelKey: 'topics.astronomy', family: 'sciences' },
  { id: 'math', labelKey: 'topics.math', family: 'sciences' },
  { id: 'psychology', labelKey: 'topics.psychology', family: 'humanities' },
  { id: 'art', labelKey: 'topics.art', family: 'humanities' },
  { id: 'history', labelKey: 'topics.history', family: 'humanities' },
  { id: 'economics', labelKey: 'topics.economics', family: 'practical' },
  { id: 'biology', labelKey: 'topics.biology', family: 'sciences' },
  { id: 'philosophy', labelKey: 'topics.philosophy', family: 'humanities' },
  { id: 'language', labelKey: 'topics.language', family: 'practical' },
  { id: 'self', title: 'توسعه‌ی فردی', family: 'practical' },
  { id: 'business', title: 'کسب‌وکار', family: 'practical' },
];

/** The nine offered as interests at first launch. */
export const INTEREST_TOPICS = TOPICS.filter((topic) => topic.labelKey);

/** Minimum interests before onboarding can continue. The CTA states this
 *  condition rather than greying out silently. */
export const MIN_INTERESTS = 2;

export const getTopic = (id: string) => TOPICS.find((topic) => topic.id === id);

/** A topic's display name, wherever it comes from. */
export const topicLabel = (topic: Topic | undefined, t: (key: string) => string) =>
  topic ? (topic.labelKey ? t(topic.labelKey) : (topic.title ?? '')) : '';
