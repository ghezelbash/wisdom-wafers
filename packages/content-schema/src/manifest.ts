import { z } from 'zod';

import type { ParseResult } from './parse';
import type { SeedBundle } from './bundle';

/**
 * What a device needs to know to fetch, verify and keep one published revision.
 *
 * The catalogue document in Firestore and the row in the device's database are
 * both this shape, so "what did we download, and is it still the thing that was
 * published?" is answerable without a network call.
 *
 * `storagePath` is a Storage **object path**, never a URL. Handing a path to
 * `fetch()` is the bug this type exists to make impossible: the transport
 * resolves it through the Storage SDK, and a value that looks like a URL is
 * rejected rather than followed.
 */

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expected an ISO timestamp' });

/** No scheme, no host, no traversal — an object path under the bucket root. */
const storagePath = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(value), {
    message: 'expected a Storage object path, not a URL',
  })
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), {
    message: 'expected a relative object path without traversal',
  });

export const SeedManifestSchema = z.object({
  seedId: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  storagePath,
  checksum: z.string().length(64),
  /** Size of the published artifact in bytes, as the publisher measured it. */
  bytes: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  publishedAt: isoDateTime,
});

export type SeedManifest = z.infer<typeof SeedManifestSchema>;

export function parseManifest(input: unknown): ParseResult<SeedManifest> {
  const result = SeedManifestSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      };
}

/**
 * The manifest a publisher records alongside an uploaded artifact.
 *
 * `bytes` is measured over the exact serialization that was uploaded, so the
 * number a reader sees in the storage manager is the number on the server.
 */
export function manifestFor(
  bundle: SeedBundle,
  input: { storagePath: string; bytes: number }
): SeedManifest {
  return {
    seedId: bundle.seedId,
    revision: bundle.revision,
    storagePath: input.storagePath,
    checksum: bundle.checksum,
    bytes: input.bytes,
    schemaVersion: bundle.schemaVersion,
    publishedAt: bundle.publishedAt,
  };
}

export const isSameRevision = (a: SeedManifest, b: SeedManifest) =>
  a.seedId === b.seedId && a.revision === b.revision && a.checksum === b.checksum;
