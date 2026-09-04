import { SeedBundleLenientSchema, SeedBundleStrictSchema, type SeedBundle } from './bundle';
import { SeedLenientSchema, SeedStrictSchema, type Seed } from './seed';

export interface ParseFailure {
  ok: false;
  /** Field path → message, flat enough to log or show in the CMS. */
  issues: { path: string; message: string }[];
}

export type ParseResult<T> = { ok: true; value: T } | ParseFailure;

function toIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): ParseFailure {
  return {
    ok: false,
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

/**
 * The publish gate. Everything must be known, complete and within limits — a
 * bundle that fails here never reaches a reader.
 */
export function parseBundleStrict(input: unknown): ParseResult<SeedBundle> {
  const result = SeedBundleStrictSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data as SeedBundle } : toIssues(result.error);
}

/**
 * The client. Content may be newer than this build: an unknown block type
 * survives as `{id, type}` so the registry renders its named fallback instead
 * of the whole seed failing.
 */
export function parseBundleLenient(input: unknown): ParseResult<SeedBundle> {
  const result = SeedBundleLenientSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : toIssues(result.error);
}

export function parseSeedStrict(input: unknown): ParseResult<Seed> {
  const result = SeedStrictSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data as Seed } : toIssues(result.error);
}

export function parseSeedLenient(input: unknown): ParseResult<Seed> {
  const result = SeedLenientSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : toIssues(result.error);
}
