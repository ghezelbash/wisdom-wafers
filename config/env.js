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

  // Development may have no backend at all — that is the guest-first promise,
  // and the emulator is the other supported shape.
  if (variant === 'development' || input.usingEmulator) return issues;

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
  ENV_NAME_KEY,
  readVariant,
  validateEnvironment,
  describeIssues,
  assertEnvironment,
  EnvironmentError,
};
