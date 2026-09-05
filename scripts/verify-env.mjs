#!/usr/bin/env node
/**
 * What this environment actually is, and whether it answers.
 *
 * Read-only, and it prints **identity, never secrets**: a project id, a package
 * name, a bucket, which auth providers are on, whether the functions are
 * deployed. An API key, a service account, a token or a reader's data never
 * reach the output, because the whole point is that this can be pasted into a
 * release record.
 *
 * It answers the question that "the build succeeded" does not: is the binary
 * pointed at the environment somebody meant, with the services it needs?
 *
 *   npm run verify:env                    # the variant in .env
 *   APP_VARIANT=staging npm run verify:env
 *
 * Against a real project it reads what a signed-out client can read, plus —
 * when `GOOGLE_APPLICATION_CREDENTIALS` is set — the deployed function list.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

/**
 * Expo loads `.env` for the config it evaluates; this process does not get it.
 * Without this the verifier reported every value as unset on a machine where
 * they were all present — a false all-clear, which is the one answer a
 * verifier must never give.
 */
function loadDotEnv(path) {
  if (!existsSync(path)) return false;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;   // the shell wins
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
  return true;
}

const VARIANT = process.env.APP_VARIANT ?? 'development';

/**
 * One environment file, chosen by variant — never two layered on top of each
 * other.
 *
 * `.env` is the developer's machine and carries
 * `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1`. Loaded underneath a staging check it
 * supplied exactly the values the staging values did not mention, and the
 * verifier reported a staging build that addresses the emulator suite — a true
 * statement about a build nobody was making.
 *
 * So: `.env.staging` if it exists, `.env` otherwise, and `EXPO_NO_DOTENV=1`
 * passed down so Expo cannot add a third layer of its own.
 */
const envFile = existsSync(`.env.${VARIANT}`) ? `.env.${VARIANT}` : '.env';
const loaded = loadDotEnv(envFile);

let failures = 0;
const rows = [];
const facts = [];

const say = (ok, text) => {
  if (!ok) failures += 1;
  rows.push(`  ${ok ? '✓' : '✗'} ${text}`);
};
const fact = (label, value) => facts.push(`  ${label.padEnd(22)} ${value}`);

/** Never printed in full: enough to compare two environments, not to use one. */
const fingerprint = (value) =>
  value ? `${String(value).slice(0, 4)}…${String(value).slice(-4)} (${String(value).length} chars)` : '—';

// ------------------------------------------------------- the resolved config

let config;
try {
  config = JSON.parse(
    execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
      encoding: 'utf8',
      // Everything this check should see is already in `process.env`. Letting
      // Expo load a file of its own is how a developer's machine gets to
      // change the answer.
      env: { ...process.env, APP_VARIANT: VARIANT, EXPO_NO_DOTENV: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  );
} catch (error) {
  console.error(`\nThe config for ${VARIANT} does not evaluate — that is the answer:\n`);
  console.error(String(error.stderr ?? error.message).split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;

fact('variant', VARIANT);
fact('configuration', loaded ? envFile : 'the shell only');
fact('app name', config.name);
fact('version', config.version);
fact('android package', config.android?.package ?? '—');
fact('scheme', Array.isArray(config.scheme) ? config.scheme.join(', ') : (config.scheme ?? '—'));
fact('declared env', process.env.EXPO_PUBLIC_ENV_NAME ?? '—');
fact('content source', process.env.EXPO_PUBLIC_CONTENT_SOURCE ?? '—');
fact('firebase project', projectId ?? '—');
fact('storage bucket', bucket ?? '—');
fact('EAS project', process.env.EAS_PROJECT_ID ?? '—');
fact('functions region', process.env.EXPO_PUBLIC_FIREBASE_REGION ?? 'europe-west1');
fact('api key', fingerprint(process.env.EXPO_PUBLIC_FIREBASE_API_KEY));

// ------------------------------------------------------------- what it is not

say(
  !JSON.stringify(config).includes('wisdom-wafers') && !(projectId ?? '').includes('wisdom-wafers'),
  'nothing resolves to the pre-rebrand project'
);
say(
  VARIANT === 'development' || process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR !== '1',
  'not addressing the emulator suite'
);
say(
  VARIANT === 'development' || process.env.EXPO_PUBLIC_CONTENT_SOURCE === 'remote',
  'serving published content rather than the seeds in the binary'
);
say(
  VARIANT === 'development' || !String(projectId ?? '').startsWith('demo-'),
  'not a demo project'
);
say(
  (process.env.EXPO_PUBLIC_ENV_NAME ?? VARIANT) === VARIANT,
  `the configuration says ${process.env.EXPO_PUBLIC_ENV_NAME ?? '—'} and the build is ${VARIANT}`
);

/**
 * The client's callable region and the functions' own must agree, or every call
 * is a 404 that reads on a device as "the network is down".
 */
const clientRegion = process.env.EXPO_PUBLIC_FIREBASE_REGION ?? 'europe-west1';
const functionsRegion =
  readFileSync(fileURLToPath(new URL('functions/src/index.ts', root)), 'utf8').match(
    /region: '([^']+)'/
  )?.[1] ?? 'unknown';

say(clientRegion === functionsRegion, `client and functions agree on ${clientRegion}`);

say(
  VARIANT !== 'staging' || config.android?.package === 'com.dananeh.app.staging',
  `the package is ${config.android?.package ?? '—'}`
);

// --------------------------------------------------------------- does it answer

const REGION = process.env.FIREBASE_REGION ?? 'europe-west1';

async function reachable(label, url, accept = (status) => status < 500) {
  try {
    const response = await fetch(url);
    say(accept(response.status), `${label} answers (${response.status})`);
    return response;
  } catch (error) {
    say(false, `${label} unreachable: ${error.message}`);
    return null;
  }
}

if (projectId && !String(projectId).startsWith('demo-')) {
  const key = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

  /**
   * Which sign-in methods are on, established by using them.
   *
   * The first version read `signIn.anonymous.enabled` off
   * `identitytoolkit/v1/projects` — a field that endpoint does not return. It
   * returns a project number and the authorised domains, so the check reported
   * "anonymous sign-in is not enabled" for a project where it was, every time.
   * A verifier that answers a question it cannot answer is worse than one that
   * declines to.
   *
   * So both are exercised. Anonymous sign-in creates a real account, which is
   * the only way to prove it works — and it is deleted immediately with the
   * token it just returned, like the synthetic crash in `diagnose`.
   */
  if (key) {
    const identity = (path, body) =>
      fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

    try {
      const anon = await identity('signUp', { returnSecureToken: true });
      const enabled = Boolean(anon.body?.idToken);

      say(
        enabled,
        `anonymous sign-in is enabled${enabled ? '' : ` — ${anon.body?.error?.message ?? anon.status}`}`
      );

      if (enabled) {
        // Never left behind: it would be an account nobody created on purpose.
        const removed = await identity('delete', { idToken: anon.body.idToken });
        say(removed.status === 200, 'and the account it created was removed again');
      }
    } catch (error) {
      say(false, `anonymous sign-in could not be tested: ${error.message}`);
    }

    try {
      /**
       * An address that cannot exist, with a password that cannot be right.
       * A disabled provider says `OPERATION_NOT_ALLOWED`; an enabled one says
       * it does not know that account — which is the answer being looked for,
       * and it creates nothing.
       */
      const probe = await identity('signInWithPassword', {
        email: `verify-${Date.now()}@dananeh-verify.invalid`,
        password: 'not-a-real-password',
        returnSecureToken: true,
      });

      const reason = String(probe.body?.error?.message ?? '');
      say(
        !reason.includes('OPERATION_NOT_ALLOWED') && !reason.includes('PASSWORD_LOGIN_DISABLED'),
        `email/password sign-in is enabled${reason.includes('OPERATION_NOT_ALLOWED') ? ' — it is not' : ''}`
      );
    } catch (error) {
      say(false, `email/password sign-in could not be tested: ${error.message}`);
    }
  } else {
    say(false, 'no API key in the environment, so sign-in cannot be tested');
  }

  await reachable(
    'Firestore',
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appConfig/public`,
    // 200 means the public document is readable, which is what a launching app
    // needs; 403 means rules or the database are not what they should be.
    (status) => status === 200
  );

  if (bucket) {
    await reachable(
      'Storage',
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`,
      (status) => status === 200 || status === 403
    );
  }

  // A callable that refuses an unauthenticated call is a callable that is
  // deployed. A 404 means it is not.
  const functionUrl = `https://${REGION}-${projectId}.cloudfunctions.net/ingestProgress`;
  const deployed = await fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { events: [] } }),
  }).catch(() => null);

  say(
    deployed !== null && deployed.status !== 404,
    `ingestProgress is deployed in ${REGION} (${deployed?.status ?? 'unreachable'})`
  );
  say(
    deployed?.status === 401 || deployed?.status === 403,
    'and refuses an unauthenticated call'
  );
} else {
  rows.push('  · no real project configured — identity only, no service checks');
}

console.log('\nEnvironment\n');
console.log(facts.join('\n'));
console.log('\nChecks\n');
console.log(rows.join('\n'));

if (failures) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('\nEnvironment verified.\n');
