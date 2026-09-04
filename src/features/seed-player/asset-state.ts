import type { AnyBlock } from '@/models/seed';
import type { CacheEntry } from '@/lib/catalog-store';

/**
 * Whether a block's image cannot be shown right now.
 *
 * Offline is a normal state: the block says so, states the resume point and
 * offers a skip, rather than showing a broken frame or a spinner that never
 * resolves.
 */
export function isAssetMissing(
  block: AnyBlock,
  seedId: string,
  catalog: { isOnline: boolean; entryFor: (seedId: string) => CacheEntry | undefined }
): boolean {
  if (block.type !== 'image') return false;
  const url = (block as { imageUrl?: string }).imageUrl;
  if (!url) return false;
  return !catalog.isOnline && catalog.entryFor(seedId)?.state !== 'cached';
}
