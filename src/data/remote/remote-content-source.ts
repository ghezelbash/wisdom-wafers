import {
  bundleToSeed,
  parseBundleLenient,
  parseManifest,
  verifyChecksum,
  type LearningPath,
  type Seed,
  type SeedBundle,
  type SeedManifest,
  type Topic,
} from '@dananeh/content-schema';
import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

import type { BundleStorage } from './bundle-storage';

/**
 * Reading published content.
 *
 * Firestore holds only what a list needs plus the manifest; the blocks live in
 * one immutable bundle per revision in Storage. That is one fetch instead of a
 * read per block, and it is what makes a downloaded seed a single verifiable
 * artifact.
 */

export interface CatalogSummary {
  seedId: string;
  currentRevision: number;
  topicId: string;
  title: string;
  objective: string;
  estimatedMinutes: number;
  difficulty: number;
  /** How to fetch the artifact and prove it is the published one. */
  manifest: SeedManifest;
}

export interface RemoteCatalog {
  seeds: CatalogSummary[];
  topics: Topic[];
  paths: LearningPath[];
  fetchedAt: string;
}

export class ContentIntegrityError extends Error {
  constructor(
    readonly seedId: string,
    readonly reason: 'unparseable' | 'checksum' = 'checksum'
  ) {
    super(`bundle failed verification for ${seedId}: ${reason}`);
    this.name = 'ContentIntegrityError';
  }
}

/** A verified revision: the bundle, the seed it maps to, and its manifest. */
export interface FetchedSeed {
  seed: Seed;
  bundle: SeedBundle;
  manifest: SeedManifest;
}

export class RemoteContentSource {
  constructor(
    private readonly db: Firestore,
    private readonly storage: BundleStorage
  ) {}

  /**
   * The catalogue.
   *
   * The `status == 'published'` constraint is not decoration: rules are not
   * filters, so a query without it fails outright rather than returning less.
   *
   * A document whose manifest does not parse is dropped rather than carried
   * forward as a half-entry — there is nothing a device could do with a seed it
   * cannot fetch or verify.
   */
  async fetchCatalog(): Promise<RemoteCatalog> {
    const published = (name: string) =>
      getDocs(query(collection(this.db, name), where('status', '==', 'published')));

    const [seeds, topics, paths] = await Promise.all([
      published('seeds'),
      published('topics'),
      published('paths'),
    ]);

    const summaries: CatalogSummary[] = [];
    for (const document of seeds.docs) {
      const data = document.data() as Record<string, unknown>;
      const manifest = parseManifest({
        seedId: data.seedId ?? document.id,
        revision: data.revision,
        storagePath: data.storagePath,
        checksum: data.checksum,
        bytes: data.bytes,
        schemaVersion: data.schemaVersion,
        publishedAt: data.publishedAt,
      });
      if (!manifest.ok) continue;

      summaries.push({
        seedId: manifest.value.seedId,
        currentRevision: (data.currentRevision as number) ?? manifest.value.revision,
        topicId: data.topicId as string,
        title: data.title as string,
        objective: data.objective as string,
        estimatedMinutes: data.estimatedMinutes as number,
        difficulty: data.difficulty as number,
        manifest: manifest.value,
      });
    }

    return {
      seeds: summaries,
      topics: topics.docs.map((document) => ({ id: document.id, ...document.data() }) as Topic),
      paths: paths.docs.map(
        (document) => ({ id: document.id, ...document.data() }) as LearningPath
      ),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * One seed, verified.
   *
   * A bundle whose checksum does not match is treated as corrupt rather than
   * rendered: a truncated download and a tampered one look identical from here,
   * and both are fixed by fetching it again.
   */
  async fetchSeed(manifest: SeedManifest): Promise<FetchedSeed> {
    const { raw } = await this.storage.fetch(manifest.storagePath);

    const parsed = parseBundleLenient(raw);
    if (!parsed.ok) throw new ContentIntegrityError(manifest.seedId, 'unparseable');

    const bundle: SeedBundle = parsed.value;
    if (!verifyChecksum(bundle as unknown as Record<string, unknown>, manifest.checksum)) {
      throw new ContentIntegrityError(manifest.seedId, 'checksum');
    }

    return { seed: bundleToSeed(bundle), bundle, manifest };
  }
}
