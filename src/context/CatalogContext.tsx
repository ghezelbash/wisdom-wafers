import type { SeedManifest } from '@dananeh/content-schema';
import * as Network from 'expo-network';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { content } from '@/data/content-repository';
import { utf8Length } from '@/data/remote/bundle-storage';
import type { DeviceCatalog, DownloadEntry } from '@/data/local/device-catalog';
import { type CacheEntry, type CatalogSnapshot } from '@/lib/catalog-store';
import { flush, listOutbox, type OutboxItem } from '@/lib/outbox';
import type { Seed } from '@/models/seed';

/**
 * Offline catalogue and outbox.
 *
 * Everything a reader can see offline comes from `DeviceCatalog`; this provider
 * is the seam between that and the screens. Three guarantees hold here:
 *
 *  - **A failed refresh changes nothing.** The catalogue swap is one commit and
 *    the sync time moves only with it, so "last true" is never a claim the
 *    content cannot back up.
 *  - **Nothing unverified is shown.** Bundles are checked against the manifest
 *    checksum on the way in and again on the way out; a mismatch is `corrupt`,
 *    which means fetch it again, not render it anyway.
 *  - **A download is a real artifact.** The manifest's Storage object path is
 *    resolved through the SDK, never handed to `fetch` as if it were a URL.
 */
interface CatalogContextValue {
  snapshot: CatalogSnapshot;
  isOnline: boolean;
  isReady: boolean;
  outbox: OutboxItem[];
  entryFor: (seedId: string) => CacheEntry | undefined;
  /** The published size of a seed's artifact, or undefined if nothing declares
   *  one. A download is never offered with an invented cost. */
  sizeFor: (seedId: string) => number | undefined;
  download: (seedId: string) => void;
  retry: (seedId: string) => void;
  remove: (seedId: string) => void;
  clearImagesOfCompleted: (completedSeedIds: string[]) => void;
  clearAllDownloads: () => void;
  refresh: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * Where the catalogue comes from.
 *
 * `mock` serves the in-repo fixtures; `remote` pulls published content and
 * keeps what is on the device if the fetch fails, so a bad deploy degrades to
 * stale content rather than an empty app.
 */
const CONTENT_SOURCE = process.env.EXPO_PUBLIC_CONTENT_SOURCE === 'remote' ? 'remote' : 'mock';

/**
 * A cache entry for content that is already on the device and has no artifact
 * to fetch — the bundled seed, and the fixtures under `mock`.
 *
 * There is deliberately no fabricated manifest here: a manifest describes a
 * published object, and inventing a Storage path and checksum for something
 * that has neither would put a value in the database that nothing could ever
 * verify. The size is measured from the seed itself, which is the real one.
 */
function inBinaryEntry(seed: Seed): DownloadEntry {
  const bytes = utf8Length(JSON.stringify(seed));
  return {
    seedId: seed.id,
    revision: seed.revision,
    state: 'cached',
    bytes,
    downloadedBytes: bytes,
    imageBytes: 0,
    cachedAt: new Date().toISOString(),
  };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>({ entries: {} });
  const [isReady, setIsReady] = useState(false);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const deviceRef = useRef<DeviceCatalog | null>(null);
  const networkState = Network.useNetworkState();
  const isOnline = networkState.isInternetReachable ?? networkState.isConnected ?? true;

  const device = useCallback(async () => {
    if (!deviceRef.current) {
      const { openDeviceCatalog } = await import('@/data/local/device-catalog');
      deviceRef.current = await openDeviceCatalog();
    }
    return deviceRef.current;
  }, []);

  useEffect(() => {
    (async () => {
      const catalog = await device();
      // Kept copies are re-verified here, before a single card is drawn.
      const stored = await catalog.hydrate();

      // Anything the device already holds replaces the fixtures; the bundled
      // seed always survives, so a first run on a dead network still opens.
      if (stored.seeds.length) content.hydrate({ seeds: stored.seeds, at: stored.lastSyncedAt ?? undefined });

      const bundled = content.getBundledSeed();
      const entries = { ...stored.entries };
      // The bundled seed ships in the binary: it is cached by definition, and a
      // first run on a dead network must still open it.
      if (!entries[bundled.id]) entries[bundled.id] = inBinaryEntry(bundled);

      setSizes(Object.fromEntries(stored.manifests.map((m) => [m.seedId, m.bytes])));
      setSnapshot({ entries, lastSyncedAt: stored.lastSyncedAt ?? undefined });
      setIsReady(true);
      setOutbox(await listOutbox());
    })();
  }, [device]);

  const putEntry = useCallback((entry: DownloadEntry) => {
    setSnapshot((current) => ({
      ...current,
      entries: { ...current.entries, [entry.seedId]: entry },
    }));
  }, []);

  /**
   * A real download: resolve the object path through Storage, verify the bytes
   * against the checksum the catalogue published, write them to the app's own
   * directory, then commit. A cache can be evicted; this is the copy the reader
   * was promised.
   */
  const downloadForReal = useCallback(
    async (catalog: DeviceCatalog, manifest: SeedManifest) => {
      try {
        const { createBundleStorage } = await import('@/data/remote/bundle-storage');
        const storage = await createBundleStorage();
        const { raw } = await storage.fetch(manifest.storagePath);

        putEntry(await catalog.saveDownload(manifest, raw));
      } catch {
        // Truncated, tampered or simply unreachable — all fixed the same way,
        // and the card offers exactly that.
        await catalog.markCorrupt(manifest);
        putEntry({
          seedId: manifest.seedId,
          revision: manifest.revision,
          state: 'corrupt',
          bytes: manifest.bytes,
          downloadedBytes: 0,
          imageBytes: 0,
        });
      }
    },
    [putEntry]
  );

  const download = useCallback(
    (seedId: string) => {
      void (async () => {
        const seed = content.getSeed(seedId);
        if (!seed) return;

        const catalog = await device();
        const manifest = (await catalog.getManifest(seedId)) ?? null;

        // Without a manifest there is no artifact to fetch and no checksum to
        // verify against, so there is nothing honest to download. Fixtures fall
        // in here: they are already in the binary and already readable offline.
        if (!manifest || CONTENT_SOURCE !== 'remote') {
          putEntry(inBinaryEntry(seed));
          return;
        }

        await catalog.markDownloading(manifest);
        putEntry({
          seedId,
          revision: manifest.revision,
          state: 'downloading',
          bytes: manifest.bytes,
          downloadedBytes: 0,
          imageBytes: 0,
        });

        await downloadForReal(catalog, manifest);
      })();
    },
    [device, downloadForReal, putEntry]
  );

  const remove = useCallback(
    (seedId: string) => {
      void (async () => {
        const catalog = await device();
        // Both halves go: the row and the file it pointed at.
        await catalog.removeDownload(seedId);
        setSnapshot((current) => {
          const entries = { ...current.entries };
          delete entries[seedId];
          return { ...current, entries };
        });
      })();
    },
    [device]
  );

  const clearImagesOfCompleted = useCallback(
    (completedSeedIds: string[]) => {
      void (async () => {
        const catalog = await device();
        const cleared: DownloadEntry[] = [];

        setSnapshot((current) => {
          const entries = { ...current.entries };
          for (const id of completedSeedIds) {
            const entry = entries[id];
            if (!entry || entry.state !== 'cached' || entry.imageBytes === 0) continue;
            const next = {
              ...entry,
              bytes: entry.bytes - entry.imageBytes,
              downloadedBytes: entry.downloadedBytes - entry.imageBytes,
              imageBytes: 0,
            };
            entries[id] = next;
            cleared.push(next);
          }
          return { ...current, entries };
        });

        for (const entry of cleared) await catalog.putEntry(entry);
      })();
    },
    [device]
  );

  const clearAllDownloads = useCallback(() => {
    void (async () => {
      const catalog = await device();
      const bundled = content.getBundledSeed().id;
      const ids = Object.keys(snapshot.entries).filter((id) => id !== bundled);

      // The bundled seed is part of the binary; clearing it would break the
      // dead-network guarantee, so it survives a "clear everything".
      for (const id of ids) await catalog.removeDownload(id);

      setSnapshot((current) => ({
        ...current,
        entries: current.entries[bundled] ? { [bundled]: current.entries[bundled] } : {},
      }));
    })();
  }, [device, snapshot.entries]);

  const refresh = useCallback(async () => {
    if (!isOnline) return;

    // The network layer is imported only when a sync actually runs: it keeps
    // the Firebase SDK out of the startup path, and out of every screen's
    // module graph.
    if (CONTENT_SOURCE === 'remote') {
      try {
        const catalog = await device();
        const [{ getDb, isFirebaseConfigured }, { RemoteContentSource }, { createBundleStorage }] =
          await Promise.all([
            import('@/data/remote/firebase-app'),
            import('@/data/remote/remote-content-source'),
            import('@/data/remote/bundle-storage'),
          ]);
        if (!isFirebaseConfigured) throw new Error('firebase-not-configured');

        const source = new RemoteContentSource(getDb(), await createBundleStorage());
        const remote = await source.fetchCatalog();

        // Each bundle is fetched and verified on its own; one bad artifact
        // costs its own seed, not the whole refresh.
        const fetched = await Promise.all(
          remote.seeds.map((summary) => source.fetchSeed(summary.manifest).catch(() => null))
        );
        const verified = fetched.filter((item): item is NonNullable<typeof item> => !!item);

        if (verified.length) {
          await catalog.commitRefresh({
            seeds: verified.map((item) => item.seed),
            manifests: verified.map((item) => item.manifest),
            at: remote.fetchedAt,
          });

          content.hydrate({
            seeds: verified.map((item) => item.seed),
            topics: remote.topics,
            paths: remote.paths,
            at: remote.fetchedAt,
          });

          setSizes((current) => ({
            ...current,
            ...Object.fromEntries(verified.map((item) => [item.manifest.seedId, item.manifest.bytes])),
          }));

          // The sync point moves only now, after the commit — a refresh that
          // failed must not claim the content is newer than it is.
          setSnapshot((current) => ({ ...current, lastSyncedAt: remote.fetchedAt }));
        }
      } catch {
        // Keep whatever is on the device, including its sync time. The banner
        // already states when the data was last true, which is the honest
        // thing to show.
      }
    }

    // Queued writes drain on the same trigger as a refresh. An item is removed
    // only when the server says it counted; a rejection is kept, dead, with its
    // reason, and a network failure is retried with backoff.
    const { sendOutboxItem } = await import('@/data/remote/outbox-transport');
    await flush(sendOutboxItem, isOnline);
    setOutbox(await listOutbox());
  }, [device, isOnline]);

  useEffect(() => {
    if (!isReady || !isOnline) return;
    let cancelled = false;
    // Deferred rather than called in the effect body: a synchronous setState
    // here would cascade a render on every connectivity change.
    Promise.resolve().then(() => {
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
    };
    // Refresh once per connectivity change, not on every snapshot write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isOnline]);

  const value = useMemo(
    () => ({
      snapshot,
      isOnline,
      isReady,
      outbox,
      entryFor: (seedId: string) => snapshot.entries[seedId],
      sizeFor: (seedId: string) => sizes[seedId] ?? snapshot.entries[seedId]?.bytes,
      download,
      retry: download,
      remove,
      clearImagesOfCompleted,
      clearAllDownloads,
      refresh,
    }),
    [
      snapshot,
      sizes,
      isOnline,
      isReady,
      outbox,
      download,
      remove,
      clearImagesOfCompleted,
      clearAllDownloads,
      refresh,
    ]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside a CatalogProvider');
  return context;
}
