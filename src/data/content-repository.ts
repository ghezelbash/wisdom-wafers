import { PATHS } from './paths';
import { anchoringSeed } from './seeds/anchoring';
import { skyDarknessSeed } from './seeds/sky-darkness';
import { sleepAndMemorySeed } from './seeds/sleep-and-memory';
import { TOPICS, getTopic, type Topic } from './topics';
import type { Seed } from '@/models/seed';
import type { LearningPath } from '@/models/path';

/**
 * How the app reads content.
 *
 * The player, Home and Explore all go through this interface so the source can
 * change without touching a screen: today a mock adapter over in-repo
 * fixtures, later a cached catalogue with a network refresh behind it.
 */
export interface ContentRepository {
  listTopics(): Topic[];
  getTopic(id: string): Topic | undefined;
  listSeeds(): Seed[];
  getSeed(id: string): Seed | undefined;
  listSeedsByTopic(topicId: string): Seed[];
  /** The seed bundled in the binary — a dead network on first run is survivable. */
  getBundledSeed(): Seed;
  /** One next seed to offer after finishing another, or undefined if ranking
   *  has nothing to say. Never invent a recommendation. */
  getNextSeed(afterSeedId: string): Seed | undefined;
  listPaths(): LearningPath[];
  getPath(id: string): LearningPath | undefined;
  listPathsForTopic(topicId: string): LearningPath[];
  /** Counts shown on the topic grid and topic detail. */
  topicStats(topicId: string): { seeds: number; paths: number };
}

/**
 * The launch catalogue.
 *
 * Every seed here is authored, sourced and **strictly** publishable — the same
 * gate the publish pipeline applies. It is what a reader sees on a first run
 * with no network, and what they fall back to if a remote refresh fails, so
 * nothing provisional belongs in it.
 *
 * It used to also contain a deliberately invalid fixture and eleven faker-
 * generated lessons with no sources. Both were reachable by real readers the
 * moment a fetch failed, which is exactly when it happened.
 */
export const LAUNCH_SEEDS: Seed[] = [skyDarknessSeed, anchoringSeed, sleepAndMemorySeed];

/**
 * The catalogue the screens read.
 *
 * Reads are synchronous because a reader should never wait on a network call to
 * see a list: the catalogue is whatever is on the device, and sync replaces it
 * in the background. `hydrate` is that replacement — until it is called, the
 * launch catalogue stands in, which is what keeps the app usable with no
 * backend.
 */
class InMemoryCatalog implements ContentRepository {
  private seeds: Seed[] = LAUNCH_SEEDS;
  private topics: Topic[] = TOPICS;
  private paths: LearningPath[] = PATHS;
  private hydratedAt: string | null = null;

  /** Replaces the catalogue with published content. The bundled seed always
   *  survives, so a dead network on first run is still survivable. */
  hydrate(input: { seeds: Seed[]; topics?: Topic[]; paths?: LearningPath[]; at?: string }) {
    const withoutBundled = input.seeds.filter((seed) => seed.id !== skyDarknessSeed.id);
    this.seeds = [skyDarknessSeed, ...withoutBundled];
    if (input.topics?.length) this.topics = input.topics;
    if (input.paths?.length) this.paths = input.paths;
    this.hydratedAt = input.at ?? new Date().toISOString();
  }

  /** Null while the fixtures are standing in. */
  get lastHydratedAt() {
    return this.hydratedAt;
  }

  listTopics = () => this.topics;
  getTopic = (id: string) => this.topics.find((topic) => topic.id === id) ?? getTopic(id);
  listSeeds = () => this.seeds;
  getSeed = (id: string) => this.seeds.find((seed) => seed.id === id);
  listSeedsByTopic = (topicId: string) => this.seeds.filter((seed) => seed.topicId === topicId);
  getBundledSeed = () => skyDarknessSeed;
  listPaths = () => this.paths;
  getPath = (id: string) => this.paths.find((path) => path.id === id);
  listPathsForTopic = (topicId: string) =>
    this.paths.filter((path) => path.topicIds.includes(topicId));

  topicStats = (topicId: string) => ({
    seeds: this.seeds.filter((seed) => seed.topicId === topicId).length,
    paths: this.paths.filter((path) => path.topicIds.includes(topicId)).length,
  });

  getNextSeed = (afterSeedId: string) => {
    const current = this.seeds.find((seed) => seed.id === afterSeedId);
    if (!current) return undefined;
    // Same topic first, then anything else unread. If neither exists, the
    // caller shows no recommendation rather than a filler one.
    return (
      this.seeds.find((seed) => seed.id !== afterSeedId && seed.topicId === current.topicId) ??
      this.seeds.find((seed) => seed.id !== afterSeedId)
    );
  };
}

export const content = new InMemoryCatalog();

/** @deprecated Use `content`; kept while call sites migrate. */
export const mockContentRepository: ContentRepository = content;

/**
 * What the scheduler can ask about a seed.
 *
 * Authored recall prompts win. Otherwise the seed's own questions are reused —
 * their correct answer and explanation are already written, so nothing is
 * invented for the sake of filling a queue.
 */
export function recallItemsFor(seed: Seed): { id: string; prompt: string; answer: string }[] {
  if (seed.recall?.length) return seed.recall;

  return seed.blocks
    .filter((block) => block.type === 'multipleChoice')
    .slice(0, 2)
    .map((block) => {
      const question = block as unknown as {
        id: string;
        question: string;
        options: { text: string; isCorrect: boolean }[];
        explanation?: string;
      };
      const correct = question.options.find((option) => option.isCorrect);
      return {
        id: question.id,
        prompt: question.question,
        answer: [correct?.text, question.explanation].filter(Boolean).join(' — '),
      };
    });
}
