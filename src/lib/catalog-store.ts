import type { CacheState, DownloadEntry } from '@/data/local/device-catalog';

/**
 * What the screens ask about the offline catalogue.
 *
 * Persistence lives in `DeviceCatalog` — SQLite on device, a key-value document
 * elsewhere — so this module holds only the derivations the UI needs. Cached,
 * downloading, corrupt and missing each have a designed appearance, so the
 * states stay distinct rather than collapsing into a boolean, and byte counts
 * are the ones the manifest and the disk actually report.
 */
export type { CacheState, DownloadEntry };

/** The name the screens already use for a download entry. */
export type CacheEntry = DownloadEntry;

export interface CatalogSnapshot {
  entries: Record<string, CacheEntry>;
  /** ISO UTC of the last catalogue refresh that committed. */
  lastSyncedAt?: string;
}

/** The quota the storage manager draws its bar against. */
export const STORAGE_QUOTA_BYTES = 30 * 1024 * 1024;

const cached = (snapshot: CatalogSnapshot) =>
  Object.values(snapshot.entries).filter((entry) => entry.state === 'cached');

export function usedBytes(snapshot: CatalogSnapshot): number {
  return cached(snapshot).reduce((total, entry) => total + entry.bytes, 0);
}

/**
 * Bytes attributable to images.
 *
 * A bundle is text; images are not downloaded with it yet, so this is zero
 * until they are — a fabricated number here would put a made-up figure in front
 * of a reader deciding what to delete.
 */
export function imageBytes(snapshot: CatalogSnapshot): number {
  return cached(snapshot).reduce((total, entry) => total + entry.imageBytes, 0);
}

export function textBytes(snapshot: CatalogSnapshot): number {
  return usedBytes(snapshot) - imageBytes(snapshot);
}

export const isAvailableOffline = (snapshot: CatalogSnapshot, seedId: string) =>
  snapshot.entries[seedId]?.state === 'cached';
