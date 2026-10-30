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
  EXPO_PUBLIC_CONTENT_SOURCE: 'remote',
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
  it('is a complete answer for development', () => {
    expect(
      validateEnvironment({ variant: 'development', env: {}, usingEmulator: true })
    ).toEqual([]);
  });

  /**
   * The exemption used to apply to every variant, and it skipped this function
   * entirely: a staging build that set the emulator flag needed no Firebase
   * configuration, could name the retired project, and could serve the seeds in
   * the binary — without one complaint.
   */
  it('is not an exemption for a release build', () => {
    const issues = validateEnvironment({
      variant: 'staging',
      env: { ...complete, EXPO_PUBLIC_USE_FIREBASE_EMULATOR: '1' },
      usingEmulator: true,
    });

    expect(issues.map((issue) => issue.problem)).toContain('emulator-in-release');
  });

  it('refuses an emulator host on a release build too', () => {
    const issues = validateEnvironment({
      variant: 'production',
      env: {
        ...complete,
        [ENV_NAME_KEY]: 'production',
        EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1',
      },
    });

    expect(issues.map((issue) => issue.key)).toContain('EXPO_PUBLIC_FIREBASE_EMULATOR_HOST');
  });
});

describe('the ways a release build can look healthy and be wrong', () => {
  /**
   * A binary serving the seeds compiled into it has a full catalogue and no
   * errors. It simply never fetches, so nothing anyone publishes arrives — and
   * that is invisible until someone asks why a correction did not appear.
   */
  it('refuses a release build that serves the seeds in the binary', () => {
    for (const value of ['mock', '', undefined]) {
      const issues = validateEnvironment({
        variant: 'staging',
        env: { ...complete, EXPO_PUBLIC_CONTENT_SOURCE: value },
      });
      expect(issues.map((issue) => issue.key)).toContain('EXPO_PUBLIC_CONTENT_SOURCE');
    }
  });

  /** There is no reader data in it and no compatibility to keep. */
  it('refuses the pre-rebrand project', () => {
    const issues = validateEnvironment({
      variant: 'staging',
      env: { ...complete, EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'wisdom-wafers' },
    });

    expect(issues.map((issue) => issue.problem)).toContain('retired-project');
  });

  it('refuses it however it is spelled in a longer id', () => {
    const issues = validateEnvironment({
      variant: 'production',
      env: {
        ...complete,
        [ENV_NAME_KEY]: 'production',
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'wisdom-wafers-prod-2',
      },
    });

    expect(issues.map((issue) => issue.problem)).toContain('retired-project');
  });

  /** Without it, `eas build` creates a new project instead of joining one. */
  it('requires the EAS project identity when the build needs it', () => {
    expect(
      validateEnvironment({ variant: 'staging', env: complete, requireEasProject: true })
        .map((issue) => issue.key)
    ).toContain('EAS_PROJECT_ID');

    expect(
      validateEnvironment({
        variant: 'staging',
        env: { ...complete, EAS_PROJECT_ID: '0000-1111' },
        requireEasProject: true,
      })
    ).toEqual([]);
  });

  it('does not ask development for any of it', () => {
    expect(
      validateEnvironment({
        variant: 'development',
        env: { EXPO_PUBLIC_CONTENT_SOURCE: 'mock', EXPO_PUBLIC_USE_FIREBASE_EMULATOR: '1' },
        requireEasProject: true,
      })
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

    // Six Firebase keys, the environment name, and the content source.
    expect(issues.length).toBe(REQUIRED_FIREBASE_KEYS.length + 2);
    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining([...REQUIRED_FIREBASE_KEYS, ENV_NAME_KEY, 'EXPO_PUBLIC_CONTENT_SOURCE'])
    );
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

/**
 * The check that runs on the device must supply every input the validator asks
 * for.
 *
 * This is the bug that bricked the first APK. `EXPO_PUBLIC_CONTENT_SOURCE` was
 * added to `validateEnvironment` — which is shared between the build and the
 * device — and only the build-time callers were updated.
 * `currentEnvironmentIssues` passed six Firebase keys and the environment name,
 * so on a device the content source read as absent and a **correctly
 * configured** staging build reported itself misconfigured, on every launch.
 *
 * The app then rendered the misconfiguration screen, which mounts none of the
 * providers — including the one that hides the native splash. The phone showed
 * the logo and nothing else, forever.
 */
describe('what a release build actually validates on the device', () => {
  /** Exactly the object `currentEnvironmentIssues` builds, fully populated. */
  const onDevice = {
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyExample',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'dananeh-staging.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'dananeh-staging',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'dananeh-staging.firebasestorage.app',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1066103901472',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:1066103901472:web:abc',
    [ENV_NAME_KEY]: 'staging',
    EXPO_PUBLIC_CONTENT_SOURCE: 'remote',
  };

  it('passes for a correctly configured staging build', () => {
    expect(validateEnvironment({ variant: 'staging', env: onDevice })).toEqual([]);
  });

  it('passes for a correctly configured production build', () => {
    expect(
      validateEnvironment({
        variant: 'production',
        env: { ...onDevice, [ENV_NAME_KEY]: 'production' },
      })
    ).toEqual([]);
  });

  /**
   * The guard that generalises it: every key the validator can complain about
   * has to be one the runtime check supplies. A rule added without a matching
   * input fails here rather than on a phone.
   */
  it('supplies an input for every key the validator can reject', () => {
    const complaints = validateEnvironment({ variant: 'staging', env: {} })
      .map((issue) => issue.key)
      .filter((key) => key !== 'EAS_PROJECT_ID'); // build-time only, by design

    expect(complaints.length).toBeGreaterThan(0);
    for (const key of complaints) {
      expect([key, Object.keys(onDevice)]).toEqual([key, expect.arrayContaining([key])]);
    }
  });

  it('still refuses a release build that is genuinely incomplete', () => {
    expect(
      validateEnvironment({
        variant: 'staging',
        env: { ...onDevice, EXPO_PUBLIC_CONTENT_SOURCE: 'mock' },
      }).map((issue) => issue.key)
    ).toContain('EXPO_PUBLIC_CONTENT_SOURCE');
  });
});
