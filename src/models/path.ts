/**
 * A path (رویش) — a curated sequence of seeds on one thread.
 *
 * Paths sit above loose seeds in topic detail, because an ordered route is more
 * useful than a pile when someone has decided to go deeper.
 */
export interface LearningPath {
  id: string;
  title: string;
  description: string;
  /** Ordered; progress is "how many of these are finished". */
  seedIds: string[];
  topicIds: string[];
}
