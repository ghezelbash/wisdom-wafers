import {
  ENV_NAME_KEY,
  REQUIRED_FIREBASE_KEYS,
  assertEnvironment,
  currentEnvironmentIssues,
  describeIssues,
  readVariant,
  validateEnvironment,
} from '@/platform/env';
import { appVariant } from '@/platform/app-info';

/**
 * A build has to be the build it says it is.
 *
 * The failure being prevented shipped once already: `.env` named a project that
 * did not exist, the API key was rejected, and the app fell back to a
 * device-local identity. Nothing crashed. Sign-in simply "did not work".
 */

const complete = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyExample',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'dananeh-staging.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'dananeh-staging',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'dananeh-staging.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1234567890:android:abc',
  [ENV_NAME_KEY]: 'staging',
};

describe('reading the variant', () => {
  it('accepts the three it knows and treats anything else as production', () => {
    expect(readVariant('development')).toBe('development');
    expect(readVariant('staging')).toBe('staging');
    expect(readVariant('production')).toBe('production');
    // The safe default: an unrecognised variant must not get the loosest rules.
    expect(readVariant(undefined)).toBe('production');
    expect(readVariant('prod')).toBe('production');
  });
});

describe('development', () => {
  it('needs nothing — working with no backend at all is the point', () => {
    expect(validateEnvironment({ variant: 'development', env: {} })).toEqual([]);
  });
});

describe('the emulator', () => {
  it('is a complete answer on its own, whatever the variant', () => {
    expect(
      validateEnvironment({ variant: 'staging', env: {}, usingEmulator: true })
    ).toEqual([]);
  });
});

describe('staging and production', () => {
  it('accept a complete, self-consistent environment', () => {
    expect(validateEnvironment({ variant: 'staging', env: complete })).toEqual([]);
    expect(
      validateEnvironment({
        variant: 'production',
        env: { ...complete, [ENV_NAME_KEY]: 'production' },
      })
    ).toEqual([]);
  });

  it.each(REQUIRED_FIREBASE_KEYS)('refuse a build with no %s', (key) => {
    const env = { ...complete, [key]: undefined };
    const issues = validateEnvironment({ variant: 'staging', env });

    expect(issues.map((issue) => issue.key)).toContain(key);
  });

  it('report every problem at once, not one per build', () => {
    const issues = validateEnvironment({ variant: 'staging', env: {} });
    expect(issues.length).toBe(REQUIRED_FIREBASE_KEYS.length + 1);
  });

  it('treat a placeholder as missing', () => {
    for (const value of ['', '   ', 'undefined', 'CHANGEME', 'your-api-key']) {
      const issues = validateEnvironment({
        variant: 'staging',
        env: { ...complete, EXPO_PUBLIC_FIREBASE_API_KEY: value },
      });
      expect(issues.map((issue) => issue.key)).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    }
  });

  it('refuse a demo project, which is never backed by a real one', () => {
    const issues = validateEnvironment({
      variant: 'staging',
      env: { ...complete, EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-dananeh' },
    });

    expect(issues.map((issue) => issue.problem)).toContain('demo-project');
  });

  /**
   * The check this whole file exists for: a staging build must not carry
   * production's Firebase project. Project ids are named by whoever created
   * them and cannot be relied on to say which is which, so the environment
   * declares it and the variant is compared against that.
   */
  it('refuse a staging build carrying production configuration', () => {
    const issues = validateEnvironment({
      variant: 'staging',
      env: { ...complete, [ENV_NAME_KEY]: 'production' },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ key: ENV_NAME_KEY, problem: 'variant-mismatch' });
  });

  it('refuse a production build carrying staging configuration', () => {
    const issues = validateEnvironment({
      variant: 'production',
      env: complete,
    });

    expect(issues.map((issue) => issue.problem)).toEqual(['variant-mismatch']);
  });

  it('refuse a build that does not declare its environment at all', () => {
    const issues = validateEnvironment({
      variant: 'staging',
      env: { ...complete, [ENV_NAME_KEY]: undefined },
    });

    expect(issues).toEqual([
      expect.objectContaining({ key: ENV_NAME_KEY, problem: 'missing' }),
    ]);
  });
});

describe('what it says when it refuses', () => {
  it('names the variable and what to do about it', () => {
    const issues = validateEnvironment({ variant: 'staging', env: {} });
    const message = describeIssues(issues);

    expect(message).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    expect(message).toContain('EAS environment');
    expect(message).toContain('docs/runbooks/environments.md');
  });

  it('throws rather than returning, so a build stops', () => {
    expect(() => assertEnvironment({ variant: 'staging', env: {} })).toThrow(
      /not configured for the environment/
    );
    expect(() => assertEnvironment({ variant: 'staging', env: complete })).not.toThrow();
  });
});

/**
 * The runtime half, which bricked `npm run web`.
 *
 * `APP_VARIANT` is not an `EXPO_PUBLIC_` variable, so it never reaches the
 * bundle. The startup check was re-deriving the variant from
 * `Constants.expoConfig.extra`, which is empty at runtime on web — so every dev
 * server looked like a *production* build carrying development configuration,
 * and the whole app was replaced by the misconfiguration screen.
 *
 * The cross-check belongs at build time, where both values exist. What is left
 * here only asks whether the configuration is complete.
 */
describe('the check that runs inside the app', () => {
  it('says nothing in a dev server, whatever the environment looks like', () => {
    // `__DEV__` is true under the test runner, which is the same signal a Metro
    // dev server gives — and the case that regressed.
    expect(currentEnvironmentIssues('production')).toEqual([]);
    expect(currentEnvironmentIssues('development')).toEqual([]);
    expect(currentEnvironmentIssues('staging')).toEqual([]);
  });

  it('never reports a variant mismatch, because it cannot see APP_VARIANT', () => {
    for (const variant of ['development', 'staging', 'production'] as const) {
      const issues = currentEnvironmentIssues(variant);
      expect(issues.map((issue) => issue.problem)).not.toContain('variant-mismatch');
    }
  });

  it('reads the environment from a variable that survives into the bundle', () => {
    // Only `EXPO_PUBLIC_*` is inlined at build time. Reading the variant from
    // anywhere else is how the original bug happened.
    const previous = process.env.EXPO_PUBLIC_ENV_NAME;
    try {
      process.env.EXPO_PUBLIC_ENV_NAME = 'staging';
      expect(appVariant()).toBe('staging');

      process.env.EXPO_PUBLIC_ENV_NAME = 'development';
      expect(appVariant()).toBe('development');

      delete process.env.EXPO_PUBLIC_ENV_NAME;
      // The safe default when nothing declares it.
      expect(appVariant()).toBe('production');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ENV_NAME;
      else process.env.EXPO_PUBLIC_ENV_NAME = previous;
    }
  });
});
