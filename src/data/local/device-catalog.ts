import type { SeedManifest } from '@dananeh/content-schema';

import type { Seed } from '@/models/seed';

import { BundleRepository, type BundleFileStore } from './bundle-files';
import * as local from './local-store';
import type { SqlDriver } from './sql';

/**
 * The device's copy of the catalogue.
 *
 * Everything the app knows about content when there is no network comes from
 * here: the seeds, the manifest that proves each one is the published revision,
 * and which of them the reader asked to keep. Two backends sit behind one API —
 * SQLite on device, a key-value document elsewhere — and nothing above this
 * file knows which is in use.
 *
 * Two rules hold on every path:
 *
 *  - **Nothing unverified enters.** A bundle is checked against its manifest
 *    checksum before it is written and again every time it is read.
 *  - **A refresh either commits or changes nothing.** Seeds, manifests and the
 *    sync point land in one transaction, so a failed refresh leaves the last
 *    good catalogue exactly as it was.
 */

export type CacheState = 'missing' | 'downloading' | 'cached' | 'corrupt';

export interface DownloadEntry {
  seedId: string;
  revision: number;
  state: CacheState;
  bytes: number;
  downloadedBytes: number;
  imageBytes: number;
  cachedAt?: string;
}

export interface DeviceSnapshot {
  seeds: Seed[];
  manifests: SeedManifest[];
  entries: Record<string, DownloadEntry>;
  /** Null until a refresh has actually committed. */
  lastSyncedAt: string | null;
}

/** The narrow persistence surface both backends implement. */
export interface CatalogStore {
  readAll(): Promise<DeviceSnapshot>;
  replaceCatalog(input: {
    seeds: Seed[];
    manifests: SeedManifest[];
    at: string;
    removeSeedIds: string[];
  }): Promise<void>;
  getManifest(seedId: string): Promise<SeedManifest | null>;
  putEntry(entry: DownloadEntry): Promise<void>;
  commitDownload(input: {
    manifest: SeedManifest;
    path: string;
    bytes: number;
  }): Promise<void>;
  removeEntry(seedId: string): Promise<void>;
}

// ------------------------------------------------------------------- SQLite

function rowToEntry(row: Record<string, unknown>): DownloadEntry {
  return {
    seedId: row.seed_id as string,
    revision: row.revision as number,
    state: row.state as CacheState,
    bytes: row.bytes_total as number,
    downloadedBytes: row.bytes_done as number,
    imageBytes: row.image_bytes as number,
    cachedAt: (row.updated_at as string) ?? undefined,
  };
}

export class SqlCatalogStore implements CatalogStore {
  constructor(private readonly driver: SqlDriver) {}

  async readAll(): Promise<DeviceSnapshot> {
    const [seeds, manifests, rows, lastSyncedAt] = await Promise.all([
      local.listSeeds(this.driver),
      local.listManifests(this.driver),
      local.listDownloads(this.driver) as Promise<Record<string, unknown>[]>,
      local.getSyncedAt(this.driver),
    ]);

    const entries: Record<string, DownloadEntry> = {};
    for (const row of rows) {
      const entry = rowToEntry(row);
      entries[entry.seedId] = entry;
    }

    return { seeds, manifests, entries, lastSyncedAt };
  }

  replaceCatalog(input: {
    seeds: Seed[];
    manifests: SeedManifest[];
    at: string;
    removeSeedIds: string[];
  }) {
    return local.replaceCatalog(this.driver, input);
  }

  getManifest(seedId: string) {
    return local.getManifest(this.driver, seedId);
  }

  async putEntry(entry: DownloadEntry) {
    await local.recordDownload(this.driver, {
      seedId: entry.seedId,
      revision: entry.revision,
      state: entry.state,
      bytesTotal: entry.bytes,
      bytesDone: entry.downloadedBytes,
      imageBytes: entry.imageBytes,
    });
  }

  commitDownload(input: { manifest: SeedManifest; path: string; bytes: number }) {
    return local.commitDownload(this.driver, input);
  }

  async removeEntry(seedId: string) {
    await local.deleteDownload(this.driver, seedId);
  }
}

// -------------------------------------------------------------- key-value

interface KeyValueDocument {
  seeds: Seed[];
  manifests: SeedManifest[];
  entries: Record<string, DownloadEntry>;
  lastSyncedAt: string | null;
}

const EMPTY_DOCUMENT: KeyValueDocument = {
  seeds: [],
  manifests: [],
  entries: {},
  lastSyncedAt: null,
};

export const CATALOG_KEY = 'dananeh.catalog.v2';

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * The web backend. One document, rewritten whole — which is the same atomicity
 * guarantee the transaction gives on device, for a catalogue this size.
 */
export class KeyValueCatalogStore implements CatalogStore {
  constructor(private readonly kv: KeyValue) {}

  private async read(): Promise<KeyValueDocument> {
    try {
      const raw = await this.kv.getItem(CATALOG_KEY);
      return raw ? { ...EMPTY_DOCUMENT, ...(JSON.parse(raw) as KeyValueDocument) } : EMPTY_DOCUMENT;
    } catch {
      return EMPTY_DOCUMENT;
    }
  }

  private async write(document: KeyValueDocument) {
    await this.kv.setItem(CATALOG_KEY, JSON.stringify(document));
  }

  async readAll(): Promise<DeviceSnapshot> {
    return this.read();
  }

  async replaceCatalog(input: {
    seeds: Seed[];
    manifests: SeedManifest[];
    at: string;
    removeSeedIds: string[];
  }) {
    const document = await this.read();
    const removed = new Set(input.removeSeedIds);
    const byId = new Map(
      document.seeds.filter((seed) => !removed.has(seed.id)).map((seed) => [seed.id, seed])
    );
    const manifestsById = new Map(
      document.manifests
        .filter((manifest) => !removed.has(manifest.seedId))
        .map((manifest) => [manifest.seedId, manifest])
    );

    for (const seed of input.seeds) byId.set(seed.id, seed);
    for (const manifest of input.manifests) manifestsById.set(manifest.seedId, manifest);

    await this.write({
      seeds: [...byId.values()],
      manifests: [...manifestsById.values()],
      entries: document.entries,
      lastSyncedAt: input.at,
    });
  }

  async getManifest(seedId: string) {
    const document = await this.read();
    return document.manifests.find((manifest) => manifest.seedId === seedId) ?? null;
  }

  async putEntry(entry: DownloadEntry) {
    const document = await this.read();
    await this.write({ ...document, entries: { ...document.entries, [entry.seedId]: entry } });
  }

  async commitDownload(input: { manifest: SeedManifest; path: string; bytes: number }) {
    const document = await this.read();
    const manifests = document.manifests.filter(
      (manifest) => manifest.seedId !== input.manifest.seedId
    );

    await this.write({
      ...document,
      manifests: [...manifests, input.manifest],
      entries: {
        ...document.entries,
        [input.manifest.seedId]: {
          seedId: input.manifest.seedId,
          revision: input.manifest.revision,
          state: 'cached',
          bytes: input.bytes,
          downloadedBytes: input.bytes,
          imageBytes: 0,
          cachedAt: new Date().toISOString(),
        },
      },
    });
  }

  async removeEntry(seedId: string) {
    const document = await this.read();
    const entries = { ...document.entries };
    delete entries[seedId];
    await this.write({ ...document, entries });
  }
}

/** A file store over the same key-value backend, for platforms without files. */
export function keyValueFileStore(kv: KeyValue): BundleFileStore {
  const key = (name: string) => `dananeh.bundle.${name}`;
  return {
    async write(name, body) {
      await kv.setItem(key(name), body);
    },
    async read(name) {
      return kv.getItem(key(name));
    },
    async remove(name) {
      await kv.setItem(key(name), '');
    },
    async exists(name) {
      return Boolean(await kv.getItem(key(name)));
    },
  };
}

// -------------------------------------------------------------- the catalogue

export class DeviceCatalog {
  private readonly bundles: BundleRepository;

  constructor(
    private readonly store: CatalogStore,
    files: BundleFileStore
  ) {
    this.bundles = new BundleRepository(files);
  }

  /**
   * What the app opens with.
   *
   * Every kept copy is re-verified here, before anything is shown. A file that
   * no longer matches its manifest flips to `corrupt` — the reader is told, and
   * the next refresh fetches it again — rather than being parsed and rendered.
   */
  async hydrate(): Promise<DeviceSnapshot> {
    const snapshot = await this.store.readAll();
    const manifests = new Map(snapshot.manifests.map((manifest) => [manifest.seedId, manifest]));

    for (const entry of Object.values(snapshot.entries)) {
      if (entry.state !== 'cached') continue;

      const manifest = manifests.get(entry.seedId);
      const intact = manifest ? await this.bundles.verify(manifest) : false;
      if (intact) continue;

      const corrupt: DownloadEntry = { ...entry, state: 'corrupt' };
      snapshot.entries[entry.seedId] = corrupt;
      await this.store.putEntry(corrupt);
    }

    return snapshot;
  }

  /**
   * Commits a refresh.
   *
   * Called only with content that already verified, and only once every seed in
   * the batch has been written to disk — so the catalogue swap is the last step
   * and there is no window in which a row points at a file that is not there.
   */
  async commitRefresh(input: {
    seeds: Seed[];
    manifests: SeedManifest[];
    at: string;
    removeSeedIds?: string[];
  }) {
    await this.store.replaceCatalog({ ...input, removeSeedIds: input.removeSeedIds ?? [] });
  }

  getManifest(seedId: string) {
    return this.store.getManifest(seedId);
  }

  /** Writes one entry through, for state the screens change directly. */
  putEntry(entry: DownloadEntry) {
    return this.store.putEntry(entry);
  }

  /** Marks a download as started, with the size the manifest declares. */
  async markDownloading(manifest: SeedManifest) {
    await this.store.putEntry({
      seedId: manifest.seedId,
      revision: manifest.revision,
      state: 'downloading',
      bytes: manifest.bytes,
      downloadedBytes: 0,
      imageBytes: 0,
    });
  }

  async markCorrupt(manifest: Pick<SeedManifest, 'seedId' | 'revision' | 'bytes'>) {
    await this.store.putEntry({
      seedId: manifest.seedId,
      revision: manifest.revision,
      state: 'corrupt',
      bytes: manifest.bytes,
      downloadedBytes: 0,
      imageBytes: 0,
    });
  }

  /**
   * Stores a downloaded bundle: verify, write, commit.
   *
   * If the commit fails the file is removed again, so the disk never keeps a
   * copy no row knows about. If the verification fails nothing is written at
   * all — a truncated download and a tampered one are the same thing here.
   */
  async saveDownload(manifest: SeedManifest, raw: unknown): Promise<DownloadEntry> {
    const stored = await this.bundles.save(manifest, raw);

    try {
      await this.store.commitDownload({
        manifest,
        path: stored.path,
        bytes: stored.bytes,
      });
    } catch (error) {
      await this.bundles.remove(manifest).catch(() => {});
      throw error;
    }

    return {
      seedId: manifest.seedId,
      revision: manifest.revision,
      state: 'cached',
      bytes: stored.bytes,
      downloadedBytes: stored.bytes,
      imageBytes: 0,
      cachedAt: new Date().toISOString(),
    };
  }

  /** The kept copy, re-verified. Throws `BundleIntegrityError` if it has rotted. */
  loadDownload(manifest: SeedManifest) {
    return this.bundles.load(manifest);
  }

  /** Deletes both halves: the row and the file it pointed at. */
  async removeDownload(seedId: string) {
    const manifest = await this.store.getManifest(seedId);
    await this.store.removeEntry(seedId);
    if (manifest) await this.bundles.remove(manifest).catch(() => {});
  }
}

/** Builds the catalogue for whichever backend this platform has. */
export async function openDeviceCatalog(): Promise<DeviceCatalog> {
  const [{ getLocalDriver }, { getBundleFiles }, { default: AsyncStorage }] = await Promise.all([
    import('./expo-driver'),
    import('./bundle-files'),
    import('@react-native-async-storage/async-storage'),
  ]);

  const driver = await getLocalDriver();
  const files = (await getBundleFiles()) ?? keyValueFileStore(AsyncStorage);

  if (driver) {
    await local.open(driver);
    return new DeviceCatalog(new SqlCatalogStore(driver), files);
  }

  return new DeviceCatalog(new KeyValueCatalogStore(AsyncStorage), files);
}
