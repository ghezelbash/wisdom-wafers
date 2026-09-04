import {
  assertStoragePath,
  BundleTransportError,
  utf8Length,
  type BundleStorage,
} from '../../src/data/remote/bundle-storage';

/**
 * A bucket in a Map, behind the same interface the device uses.
 *
 * It still enforces the path rule, so a test cannot accidentally prove that a
 * URL works where only an object path should.
 */
export function memoryBundleStorage(objects: Map<string, string>): BundleStorage {
  return {
    async fetch(storagePath) {
      const path = assertStoragePath(storagePath);
      const stored = objects.get(path);
      if (stored === undefined) throw new BundleTransportError(path, 'not-found');
      return { raw: JSON.parse(stored), bytes: utf8Length(stored) };
    },
  };
}
