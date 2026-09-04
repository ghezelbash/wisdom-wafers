import * as rules from '../../config/env';

/**
 * The typed façade over `config/env.js`.
 *
 * The rules live in plain CommonJS because `app.config.ts` is transpiled on its
 * own by the Expo config loader and cannot import a TypeScript module — so the
 * same validation runs at build time and at startup without being written
 * twice. See the comment at the top of that file.
 */

export type Variant = 'development' | 'staging' | 'production';

export type EnvProblem = 'missing' | 'placeholder' | 'variant-mismatch' | 'demo-project';

export interface EnvIssue {
  key: string;
  problem: EnvProblem;
  detail: string;
}

export interface EnvInput {
  variant: Variant;
  env: Record<string, string | undefined>;
  /** True when the build is deliberately pointed at the emulator suite. */
  usingEmulator?: boolean;
}

export const VARIANTS = rules.VARIANTS as Variant[];
export const REQUIRED_FIREBASE_KEYS = rules.REQUIRED_FIREBASE_KEYS as readonly string[];
export const ENV_NAME_KEY: string = rules.ENV_NAME_KEY;

export const readVariant = (value: string | undefined): Variant =>
  rules.readVariant(value) as Variant;

export const validateEnvironment = (input: EnvInput): EnvIssue[] =>
  rules.validateEnvironment(input) as EnvIssue[];

export const describeIssues = (issues: EnvIssue[]): string => rules.describeIssues(issues);

export const assertEnvironment = (input: EnvInput): void => rules.assertEnvironment(input);

export const EnvironmentError = rules.EnvironmentError as unknown as new (
  issues: EnvIssue[]
) => Error & { issues: EnvIssue[] };

/**
 * The environment this running binary was built with.
 *
 * Read from `process.env` because Expo inlines `EXPO_PUBLIC_*` at build time —
 * these are the values that were present when the binary was made, which is
 * exactly what should be checked.
 */
export function currentEnvironmentIssues(variant: Variant): EnvIssue[] {
  return validateEnvironment({
    variant,
    env: {
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      EXPO_PUBLIC_ENV_NAME: process.env.EXPO_PUBLIC_ENV_NAME,
    },
    usingEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1',
  });
}
