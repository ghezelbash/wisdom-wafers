import {
  bundleToSeed,
  parseBundleLenient,
  verifyChecksum,
  type Seed,
  type SeedBundle,
  type SeedManifest,
} from '@dananeh/content-schema';

/**
 * Downloaded bundles on disk.
 *
 * A system cache is not a guarantee — it can be evicted at any moment — so a
 * seed the reader asked to keep is written to the app's own directory and
 * verified on the way in and on the way out. Corrupt means "fetch it again",
 * never "render it anyway".
 *
 * The filesystem sits behind `BundleFileStore` so the same verification logic
 * runs against `expo-file-system` on a device and a real temporary directory in
 * tests — mocking it would only prove the code calls itself.
 */

export class BundleIntegrityError extends Error {
  constructor(
    readonly seedId: string,
    readonly reason: 'missing' | 'unreadable' | 'unparseable' | 'checksum'
  ) {
    super(`bundle failed verification: ${seedId} (${reason})`);
    this.name = 'BundleIntegrityError';
  }
}

/** One revision, one file: a new revision never overwrites the one in use. */
export const bundleFileName = (manifest: Pick<SeedManifest, 'seedId' | 'revision'>) =>
  `${manifest.seedId}__${manifest.revision}.json`;

export interface BundleFileStore {
  write(name: string, body: string): Promise<void>;
  read(name: string): Promise<string | null>;
  remove(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

export interface StoredBundle {
  path: string;
  bytes: number;
  checksum: string;
}

/** UTF-8 byte length, without depending on Node's `Buffer`. */
function utf8Length(body: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(body).length;
  return unescape(encodeURIComponent(body)).length;
}

export class BundleRepository {
  constructor(private readonly files: BundleFileStore) {}

  /**
   * Writes a bundle only if its bytes match the checksum the catalogue
   * published. Verifying before the write keeps a corrupt artifact off the disk
   * entirely, which is what makes "cached" mean something.
   */
  async save(manifest: SeedManifest, raw: unknown): Promise<StoredBundle> {
    const parsed = parseBundleLenient(raw);
    if (!parsed.ok) throw new BundleIntegrityError(manifest.seedId, 'unparseable');

    const bundle = parsed.value as unknown as Record<string, unknown>;
    if (!verifyChecksum(bundle, manifest.checksum)) {
      throw new BundleIntegrityError(manifest.seedId, 'checksum');
    }

    const name = bundleFileName(manifest);
    const body = JSON.stringify(bundle);
    await this.files.write(name, body);

    return { path: name, bytes: utf8Length(body), checksum: manifest.checksum };
  }

  /** Reads a stored bundle, re-verifying it — disk contents can rot. */
  async load(manifest: SeedManifest): Promise<Seed> {
    const name = bundleFileName(manifest);

    let body: string | null;
    try {
      body = await this.files.read(name);
    } catch {
      throw new BundleIntegrityError(manifest.seedId, 'unreadable');
    }
    if (body === null) throw new BundleIntegrityError(manifest.seedId, 'missing');

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new BundleIntegrityError(manifest.seedId, 'unparseable');
    }

    const parsed = parseBundleLenient(raw);
    if (!parsed.ok) throw new BundleIntegrityError(manifest.seedId, 'unparseable');
    if (!verifyChecksum(parsed.value as unknown as Record<string, unknown>, manifest.checksum)) {
      throw new BundleIntegrityError(manifest.seedId, 'checksum');
    }

    return bundleToSeed(parsed.value as SeedBundle);
  }

  /** True only if the file is there *and* still verifies. */
  async verify(manifest: SeedManifest): Promise<boolean> {
    try {
      await this.load(manifest);
      return true;
    } catch {
      return false;
    }
  }

  async remove(manifest: Pick<SeedManifest, 'seedId' | 'revision'>): Promise<void> {
    await this.files.remove(bundleFileName(manifest));
  }

  async exists(manifest: Pick<SeedManifest, 'seedId' | 'revision'>): Promise<boolean> {
    return this.files.exists(bundleFileName(manifest));
  }
}

/**
 * The device's own directory. Null on web, where there is no such thing and the
 * key-value backend stands in — the same split as SQLite.
 */
export async function getBundleFiles(): Promise<BundleFileStore | null> {
  try {
    const { Directory, File, Paths } = await import('expo-file-system');
    const directory = new Directory(Paths.document, 'seeds');
    if (!directory.exists) directory.create({ intermediates: true });

    return {
      async write(name, body) {
        const file = new File(directory, name);
        if (file.exists) file.delete();
        file.create();
        file.write(body);
      },
      async read(name) {
        const file = new File(directory, name);
        return file.exists ? file.textSync() : null;
      },
      async remove(name) {
        const file = new File(directory, name);
        if (file.exists) file.delete();
      },
      async exists(name) {
        return new File(directory, name).exists;
      },
    };
  } catch {
    return null;
  }
}
