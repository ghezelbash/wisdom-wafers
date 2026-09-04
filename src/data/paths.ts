import type { LearningPath } from '@/models/path';

/**
 * Learning paths over the launch catalogue.
 *
 * Every `seedId` here has to resolve — a path pointing at content that is not
 * shipped renders as an empty list, which is worse than not offering the path.
 * The launch-catalogue test holds that line.
 *
 * There is one path rather than two on purpose. A second would need two seeds
 * in the same topic, and the launch catalogue has one per topic; a path built
 * out of whatever was to hand would not be a path.
 */
export const PATHS: LearningPath[] = [
  {
    id: 'path-thinking-clearly',
    title: 'دقیق‌تر فکر کردن',
    description: 'الگوهایی که تصمیم‌های روزمره را کج می‌کنند، و کاری که مغز شب‌ها با آنچه یاد گرفته‌ای می‌کند.',
    seedIds: ['seed-anchoring', 'seed-sleep-and-memory'],
    topicIds: ['psychology', 'biology'],
  },
];
