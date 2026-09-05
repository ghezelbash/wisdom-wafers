/**
 * What a build needs to be the build it says it is.
 *
 * The failure this exists to prevent is specific and was live: `.env` pointed
 * at a project that did not match any alias in `.firebaserc`, the API key was
 * rejected, and the app quietly fell back to a device-local identity. Nothing
 * was broken enough to notice — sign-in "just didn't work", offline.
 *
 * So a staging or production binary that cannot reach its backend is a **build
 * failure**, not a degraded mode. Development keeps the fallback, because
 * working with no backend at all is the point there.
 *
 * This file is plain CommonJS on purpose. `app.config.ts` is transpiled on its
 * own by the Expo config loader — its imports are not — so a TypeScript module
 * here would fail to resolve at build time. `src/platform/env.ts` is the typed
 * façade the app uses; the rules live here, once.
 */

const VARIANTS = ['development', 'staging', 'production'];

/** Everything the Firebase web SDK needs to address a project. */
const REQUIRED_FIREBASE_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

/**
 * Names the environment this configuration belongs to.
 *
 * It is the cross-check, and the reason it is a separate variable rather than
 * derived from the project id: whoever fills in the EAS environment states
 * which one it is, so a staging build carrying production's Firebase config
 * fails instead of shipping. Project ids are named by whoever created them and
 * cannot be relied on to say.
 */
const ENV_NAME_KEY = 'EXPO_PUBLIC_ENV_NAME';

/**
 * The project this app used to be, before the rebrand.
 *
 * There is no live reader data in it and no compatibility to keep, so a staging
 * or production build pointing at it is a mistake rather than a choice — and it
 * is the kind of mistake that looks like it works, because the project exists
 * and answers.
 */
const RETIRED_PROJECT_IDS = ['wisdom-wafers'];

const PLACEHOLDERS = ['', 'undefined', 'null', 'changeme', 'todo', 'xxx', 'your-api-key'];

const isPlaceholder = (value) =>
  value === undefined || PLACEHOLDERS.includes(String(value).trim().toLowerCase());

const readVariant = (value) => (VARIANTS.includes(value) ? value : 'production');

/**
 * Everything wrong with this environment, or an empty list.
 *
 * Returns all the problems rather than the first: someone filling in a
 * dashboard should see the whole list once, not discover them one build at a
 * time.
 */
function validateEnvironment(input) {
  const variant = input.variant;
  const env = input.env || {};
  const issues = [];

  /**
   * Development may have no backend at all — that is the guest-first promise —
   * and the emulator is the other shape it supports.
   *
   * The emulator exemption used to apply to **every** variant: a staging build
   * that set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1` skipped this function
   * entirely, so it needed no Firebase configuration, could name the retired
   * project, and could serve the seeds in the binary — all without a single
   * complaint. The flag now exempts development only, and is an error anywhere
   * else.
   */
  if (variant === 'development') return issues;

  for (const key of REQUIRED_FIREBASE_KEYS) {
    if (isPlaceholder(env[key])) {
      issues.push({
        key,
        problem: 'missing',
        detail: `${variant} builds need ${key}; set it in the EAS environment for this profile.`,
      });
    }
  }

  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
    ? String(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID).trim()
    : undefined;

  if (projectId && projectId.startsWith('demo-')) {
    issues.push({
      key: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      problem: 'demo-project',
      detail: `A "demo-" project is never backed by a real one; ${variant} cannot use ${projectId}.`,
    });
  }

  if (projectId && RETIRED_PROJECT_IDS.some((retired) => projectId.includes(retired))) {
    issues.push({
      key: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      problem: 'retired-project',
      detail: `${projectId} is the pre-rebrand project. The beta uses a clean dananeh environment; see docs/runbooks/environments.md.`,
    });
  }

  /**
   * A release build that serves the seeds compiled into the binary looks
   * perfectly healthy: the catalogue is full, the seeds open, nothing errors.
   * It just never reaches the published content, so nothing anyone publishes
   * arrives — and that is invisible until someone asks why a correction did
   * not appear.
   */
  const contentSource = env.EXPO_PUBLIC_CONTENT_SOURCE
    ? String(env.EXPO_PUBLIC_CONTENT_SOURCE).trim()
    : undefined;

  if (contentSource !== 'remote') {
    issues.push({
      key: 'EXPO_PUBLIC_CONTENT_SOURCE',
      problem: contentSource ? 'not-remote' : 'missing',
      detail: `${variant} builds serve published content: set EXPO_PUBLIC_CONTENT_SOURCE=remote. It is ${contentSource ?? 'unset'}, which ships the seeds in the binary and never fetches.`,
    });
  }

  // Two ways to point a release binary at something that is not the backend.
  if (String(env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR ?? '').trim() === '1') {
    issues.push({
      key: 'EXPO_PUBLIC_USE_FIREBASE_EMULATOR',
      problem: 'emulator-in-release',
      detail: `A ${variant} build cannot address the emulator suite. Unset it for this profile.`,
    });
  }

  if (env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST) {
    issues.push({
      key: 'EXPO_PUBLIC_FIREBASE_EMULATOR_HOST',
      problem: 'emulator-in-release',
      detail: `Set for a ${variant} build; it belongs to development only.`,
    });
  }

  /**
   * EAS identity. Without it the build has no project to belong to: channels,
   * the update runtime and the build record all hang off it, and `eas build`
   * would create a *new* project rather than failing.
   */
  if (input.requireEasProject && isPlaceholder(env.EAS_PROJECT_ID)) {
    issues.push({
      key: 'EAS_PROJECT_ID',
      problem: 'missing',
      detail: 'Run `eas init` and set EAS_PROJECT_ID, or a build creates a new project instead of joining the existing one.',
    });
  }

  const envName = env[ENV_NAME_KEY] ? String(env[ENV_NAME_KEY]).trim() : undefined;
  if (!envName) {
    issues.push({
      key: ENV_NAME_KEY,
      problem: 'missing',
      detail: `Set ${ENV_NAME_KEY} to "${variant}" alongside this profile's Firebase configuration.`,
    });
  } else if (envName !== variant) {
    issues.push({
      key: ENV_NAME_KEY,
      problem: 'variant-mismatch',
      detail: `This is a ${variant} build, but the configuration says ${envName}. A staging build carrying production's project is the mistake this check exists for.`,
    });
  }

  return issues;
}

function describeIssues(issues) {
  return [
    'This build is not configured for the environment it claims to be:',
    ...issues.map((issue) => `  · ${issue.key} — ${issue.detail}`),
    'See docs/runbooks/environments.md.',
  ].join('\n');
}

class EnvironmentError extends Error {
  constructor(issues) {
    super(describeIssues(issues));
    this.name = 'EnvironmentError';
    this.issues = issues;
  }
}

/** Throws unless the environment is complete and self-consistent. */
function assertEnvironment(input) {
  const issues = validateEnvironment(input);
  if (issues.length) throw new EnvironmentError(issues);
}

module.exports = {
  VARIANTS,
  REQUIRED_FIREBASE_KEYS,
  RETIRED_PROJECT_IDS,
  ENV_NAME_KEY,
  readVariant,
  validateEnvironment,
  describeIssues,
  assertEnvironment,
  EnvironmentError,
};
