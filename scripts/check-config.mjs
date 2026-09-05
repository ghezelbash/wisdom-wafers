#!/usr/bin/env node
/**
 * Config validation, as a build gate.
 *
 * Evaluates `app.config.ts` for each variant with a synthetic environment and
 * asserts two things:
 *
 *   1. a complete environment produces the identity that variant is supposed to
 *      have — the package name and scheme a deep link depends on;
 *   2. an incomplete or mismatched one **fails**, rather than producing a
 *      binary that quietly falls back to a device-local identity.
 *
 * The second is the one worth having in CI. The first would be caught by a
 * human eventually; the second is invisible until a tester reports that
 * sign-in "does not work".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const COMPLETE = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyCiCheckPlaceholderValueNotARealKey',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'example-project',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'example-project.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:000000000000:android:0000',
  // A release build serves published content. Without this it serves the seeds
  // compiled into the binary — full catalogue, no errors, and nothing anyone
  // publishes ever arrives.
  EXPO_PUBLIC_CONTENT_SOURCE: 'remote',
};

const EXPECTED = {
  development: { package: 'com.dananeh.app.dev', scheme: 'dananeh-dev' },
  staging: { package: 'com.dananeh.app.staging', scheme: 'dananeh-staging' },
  production: { package: 'com.dananeh.app', scheme: 'dananeh' },
};

/** Reads the resolved config, with `.env` deliberately out of the way. */
function readConfig(env) {
  const output = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ...env, EXPO_NO_DOTENV: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

const failures = [];
const check = (name, run) => {
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  ✗ ${name}`);
  }
};

console.log('Identity per variant');
for (const [variant, expected] of Object.entries(EXPECTED)) {
  check(`${variant} builds ${expected.package} (${expected.scheme})`, () => {
    const config = readConfig({
      ...COMPLETE,
      APP_VARIANT: variant,
      EXPO_PUBLIC_ENV_NAME: variant,
    });

    if (config.android?.package !== expected.package) {
      throw new Error(`package was ${config.android?.package}`);
    }
    if (config.ios?.bundleIdentifier !== expected.package) {
      throw new Error(`bundleIdentifier was ${config.ios?.bundleIdentifier}`);
    }
    if (config.scheme !== expected.scheme) {
      throw new Error(`scheme was ${config.scheme}`);
    }
    if (config.extra?.variant !== variant) {
      throw new Error(`extra.variant was ${config.extra?.variant}`);
    }
  });
}

console.log('\nMisconfiguration fails the build');
const mustFail = (name, env) =>
  check(name, () => {
    let config;
    try {
      config = readConfig(env);
    } catch {
      return; // Refused, which is the point.
    }
    throw new Error(`built anyway, as ${config.android?.package}`);
  });

mustFail('staging with no Firebase configuration', {
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});
mustFail('production with no Firebase configuration', {
  APP_VARIANT: 'production',
  EXPO_PUBLIC_ENV_NAME: 'production',
});
mustFail('staging carrying production configuration', {
  ...COMPLETE,
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'production',
});
mustFail('production carrying staging configuration', {
  ...COMPLETE,
  APP_VARIANT: 'production',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});
mustFail('a real variant pointed at a demo project', {
  ...COMPLETE,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-dananeh',
  APP_VARIANT: 'production',
  EXPO_PUBLIC_ENV_NAME: 'production',
});
mustFail('a build that does not declare its environment', {
  ...COMPLETE,
  APP_VARIANT: 'production',
});

// The four ways a release build can look healthy and reach the wrong thing.
mustFail('a release build serving the seeds in the binary', {
  ...COMPLETE,
  EXPO_PUBLIC_CONTENT_SOURCE: 'mock',
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});
mustFail('a release build with no content source at all', {
  ...COMPLETE,
  EXPO_PUBLIC_CONTENT_SOURCE: '',
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});
mustFail('a release build addressing the emulator suite', {
  ...COMPLETE,
  EXPO_PUBLIC_USE_FIREBASE_EMULATOR: '1',
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});
mustFail('a release build pointed at the pre-rebrand project', {
  ...COMPLETE,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'wisdom-wafers',
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_ENV_NAME: 'staging',
});

console.log('\nThe profile the release is built from');

/**
 * `internal-apk` is what produces the artifact testers install. A profile that
 * quietly built an AAB, or resolved to development, would produce something
 * that looks like a release and is not one.
 */
check('internal-apk builds a staging APK on the preview channel', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  const profile = eas.build['internal-apk'];

  const wrong = [];
  if (profile?.android?.buildType !== 'apk') wrong.push(`buildType ${profile?.android?.buildType}`);
  if (profile?.env?.APP_VARIANT !== 'staging') wrong.push(`APP_VARIANT ${profile?.env?.APP_VARIANT}`);
  if (profile?.env?.EXPO_PUBLIC_ENV_NAME !== 'staging')
    wrong.push(`EXPO_PUBLIC_ENV_NAME ${profile?.env?.EXPO_PUBLIC_ENV_NAME}`);
  if (profile?.channel !== 'preview') wrong.push(`channel ${profile?.channel}`);
  if (profile?.distribution !== 'internal') wrong.push(`distribution ${profile?.distribution}`);

  // Inherited from `base`, and the reason a release build fetches published
  // content instead of serving the seeds compiled into it.
  const source = profile?.env?.EXPO_PUBLIC_CONTENT_SOURCE ?? eas.build.base?.env?.EXPO_PUBLIC_CONTENT_SOURCE;
  if (source !== 'remote') wrong.push(`content source ${source}`);

  if (wrong.length) throw new Error(wrong.join(', '));
});

check('no release profile addresses the emulator', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

  for (const [name, profile] of Object.entries(eas.build)) {
    if (name === 'development' || name === 'base') continue;
    if (profile.env?.EXPO_PUBLIC_USE_FIREBASE_EMULATOR) {
      throw new Error(`${name} sets EXPO_PUBLIC_USE_FIREBASE_EMULATOR`);
    }
  }
});

console.log('\nDevelopment still works with nothing configured');
check('development needs no backend', () => {
  const config = readConfig({ APP_VARIANT: 'development' });
  if (config.android?.package !== 'com.dananeh.app.dev') {
    throw new Error(`package was ${config.android?.package}`);
  }
});

if (failures.length) {
  console.error(`\n${failures.length} configuration check(s) failed:`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log('\nAll configuration checks passed.');
