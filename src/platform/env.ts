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
  /**
   * True when the build is deliberately pointed at the emulator suite.
   *
   * Only development may be. It used to exempt a build of any variant from
   * every check below — see `config/env.js`.
   */
  usingEmulator?: boolean;
  /**
   * Whether the EAS project identity is required. It is for anything `eas
   * build` will run, because without it a build creates a new project rather
   * than joining the existing one.
   */
  requireEasProject?: boolean;
}

export const VARIANTS = rules.VARIANTS as Variant[];
export const REQUIRED_FIREBASE_KEYS = rules.REQUIRED_FIREBASE_KEYS as readonly string[];
/** The project this app used to be. A release build naming it is a mistake. */
export const RETIRED_PROJECT_IDS = rules.RETIRED_PROJECT_IDS as readonly string[];
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
 * What is wrong with the configuration baked into *this running binary*.
 *
 * Two things it deliberately does not do:
 *
 *  - **It does not run in a dev server.** `__DEV__` is the one reliable signal
 *    for that, and a dev build with no backend is the guest-first promise
 *    working, not a misconfiguration.
 *  - **It does not re-check the variant against `APP_VARIANT`.** That variable
 *    is not `EXPO_PUBLIC_`, so it never reaches the bundle; the runtime check
 *    would be comparing against a value it cannot see. It was, and it reported
 *    every dev server as a production build carrying development config — which
 *    replaced the whole app with the misconfiguration screen.
 *
 * The cross-check lives at build time, in `app.config.ts`, where `APP_VARIANT`
 * and the EAS environment are both present and authoritative. What is left here
 * is the half that still matters on a device: is the Firebase configuration
 * this binary was built with actually complete?
 */
export function currentEnvironmentIssues(variant: Variant): EnvIssue[] {
  // A Metro dev server is not a shipped binary.
  if (typeof __DEV__ !== 'undefined' && __DEV__) return [];

  return validateEnvironment({
    // The environment this bundle declares. It was checked against
    // `APP_VARIANT` when the build was made.
    variant,
    env: {
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      // Set to the variant being validated, not read: comparing a value
      // against itself is the point here. The build already proved the two
      // agree; this only asks whether the configuration is complete.
      [ENV_NAME_KEY]: variant,
    },
    usingEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1',
  });
}
