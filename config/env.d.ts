/**
 * Types for `config/env.js`, which is CommonJS because the Expo config loader
 * cannot import TypeScript from `app.config.ts`. `src/platform/env.ts` is the
 * façade the app uses.
 */
export type Variant = 'development' | 'staging' | 'production';

export interface EnvIssue {
  key: string;
  problem: 'missing' | 'placeholder' | 'variant-mismatch' | 'demo-project';
  detail: string;
}

export interface EnvInput {
  variant: Variant;
  env: Record<string, string | undefined>;
  usingEmulator?: boolean;
}

export const VARIANTS: Variant[];
export const REQUIRED_FIREBASE_KEYS: readonly string[];
export const ENV_NAME_KEY: string;

export function readVariant(value: string | undefined): Variant;
export function validateEnvironment(input: EnvInput): EnvIssue[];
export function describeIssues(issues: EnvIssue[]): string;
export function assertEnvironment(input: EnvInput): void;
export class EnvironmentError extends Error {
  issues: EnvIssue[];
}
