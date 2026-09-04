import { SeedManifestSchema } from '@dananeh/content-schema';

/**
 * Getting the bytes of a published bundle.
 *
 * The catalogue records a Storage **object path**, not a URL. Passing that path
 * to `fetch()` produces a request to a relative path on whatever origin the app
 * happens to have — which silently succeeds on web and fails on device. So the
 * path is resolved through the Storage SDK, and this module is the only place
 * that knows how.
 */

export class BundleTransportError extends Error {
  constructor(
    readonly storagePath: string,
    readonly reason: string
  ) {
    super(`could not fetch ${storagePath}: ${reason}`);
    this.name = 'BundleTransportError';
  }
}

export interface FetchedBundle {
  /** Parsed JSON, still unverified — the caller checks it against a checksum. */
  raw: unknown;
  /** What actually came down the wire, for progress and storage accounting. */
  bytes: number;
}

export interface BundleStorage {
  fetch(storagePath: string): Promise<FetchedBundle>;
}

/**
 * Rejects anything that is not a bucket-relative object path.
 *
 * The schema already refuses a URL, so this is the same rule applied at the
 * transport boundary: a manifest that came from somewhere other than the parser
 * still cannot smuggle an arbitrary origin into a network call.
 */
export function assertStoragePath(storagePath: string): string {
  const result = SeedManifestSchema.shape.storagePath.safeParse(storagePath);
  if (!result.success) {
    throw new BundleTransportError(storagePath, result.error.issues[0]?.message ?? 'invalid path');
  }
  return result.data;
}

function parseJson(storagePath: string, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new BundleTransportError(storagePath, 'not json');
  }
}

/** Byte length of a UTF-8 string without depending on Node's `Buffer`. */
export function utf8Length(body: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(body).length;
  return unescape(encodeURIComponent(body)).length;
}

/**
 * Firebase Storage.
 *
 * `getDownloadURL` then `fetch` rather than `getBytes`: the download URL works
 * identically on device, on web and against the emulator, while `getBytes`
 * relies on an XHR path that is not available everywhere this code runs. The
 * URL is produced by the SDK from the object path, so no path from the
 * catalogue is ever used as a URL directly.
 */
export class FirebaseBundleStorage implements BundleStorage {
  constructor(
    private readonly resolveUrl: (storagePath: string) => Promise<string>,
    private readonly transport: typeof fetch = fetch
  ) {}

  async fetch(storagePath: string): Promise<FetchedBundle> {
    const path = assertStoragePath(storagePath);

    let url: string;
    try {
      url = await this.resolveUrl(path);
    } catch (error) {
      throw new BundleTransportError(path, (error as Error)?.message ?? 'unresolvable');
    }

    const response = await this.transport(url);
    if (!response.ok) throw new BundleTransportError(path, `http-${response.status}`);

    const body = await response.text();
    return { raw: parseJson(path, body), bytes: utf8Length(body) };
  }
}

/**
 * The device's storage transport, built lazily so the Firebase SDK stays out of
 * the startup path and out of every screen's module graph.
 */
export async function createBundleStorage(): Promise<BundleStorage> {
  const [{ getStorageBucket }, { getDownloadURL, ref }] = await Promise.all([
    import('@/data/remote/firebase-app'),
    import('firebase/storage'),
  ]);

  const bucket = getStorageBucket();
  return new FirebaseBundleStorage((path) => getDownloadURL(ref(bucket, path)));
}
