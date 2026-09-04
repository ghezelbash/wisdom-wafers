import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BundleFileStore } from '../../src/data/local/bundle-files';

/**
 * A real directory behind the same file store the device uses.
 *
 * Downloaded bundles are written and read as actual files, so the verification
 * path is exercised against bytes on a disk rather than a mock that always
 * hands back what it was given.
 */
export function nodeBundleFiles(directory = mkdtempSync(join(tmpdir(), 'dananeh-bundles-'))) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

  const store: BundleFileStore = {
    async write(name, body) {
      writeFileSync(join(directory, name), body, 'utf8');
    },
    async read(name) {
      const path = join(directory, name);
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async remove(name) {
      const path = join(directory, name);
      if (existsSync(path)) rmSync(path);
    },
    async exists(name) {
      return existsSync(join(directory, name));
    },
  };

  return {
    store,
    directory,
    /** Rewrites a stored bundle to simulate a file that rotted on disk. */
    corrupt(name: string) {
      writeFileSync(join(directory, name), '{"seedId":"tampered"}', 'utf8');
    },
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
