#!/usr/bin/env node
/**
 * The operator's regression check.
 *
 * Four things break a release, and each of them fails silently: sign-in stops
 * working, a callable starts refusing, content stops downloading, and crashes
 * stop arriving. The last is the cruel one — a broken crash pipeline looks
 * exactly like a healthy app.
 *
 * So this exercises all four the way a device does, over HTTP with a real ID
 * token, and finishes by sending a **synthetic crash** and reading it back with
 * its version, route and environment attached. If it passes, the operator knows
 * the reporting path itself works; if a real crash then never appears, it is
 * because there was no crash.
 *
 *   npm run diagnose                 # against the local emulator suite
 *   FIREBASE_PROJECT=… npm run diagnose
 *
 * Against a real project it needs a service account (`GOOGLE_APPLICATION_
 * CREDENTIALS`), a web API key (`FIREBASE_API_KEY`) and a diagnostic account
 * (`DIAGNOSE_EMAIL` / `DIAGNOSE_PASSWORD`). See
 * `docs/runbooks/observability.md`.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT ?? 'demo-dananeh';
const EMULATED = PROJECT.startsWith('demo-') || !!process.env.FIRESTORE_EMULATOR_HOST;
const REGION = process.env.FIREBASE_REGION ?? 'europe-west1';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const API_KEY = process.env.FIREBASE_API_KEY ?? 'demo-key';

if (EMULATED) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= AUTH_HOST;
}

const ACCOUNT = {
  email: process.env.DIAGNOSE_EMAIL ?? 'reader@example.com',
  password: process.env.DIAGNOSE_PASSWORD ?? 'dananeh-emulator',
};

const signInUrl = EMULATED
  ? `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`
  : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;

const callableUrl = (name) =>
  EMULATED
    ? `http://${FUNCTIONS_HOST}/${PROJECT}/${REGION}/${name}`
    : `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;

let failures = 0;
const results = [];

async function step(name, run) {
  try {
    const note = await run();
    results.push(`  ✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (error) {
    failures += 1;
    results.push(`  ✗ ${name} — ${error.message}`);
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(typeof message === 'function' ? message() : message);
};

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'diagnose'));

console.log(`\nDananeh diagnostics · project ${PROJECT} · ${EMULATED ? 'emulator' : 'live'}\n`);

// ------------------------------------------------------------ 1 · identity

let idToken = '';
let uid = '';

await step('sign-in works', async () => {
  const response = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ACCOUNT, returnSecureToken: true }),
  });
  assert(response.ok, () => `sign-in answered ${response.status}`);

  const data = await response.json();
  idToken = data.idToken;
  uid = data.localId;
  assert(idToken && uid, 'no token returned');
  return ACCOUNT.email;
});

const callable = async (name, data) => {
  const response = await fetch(callableUrl(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json().catch(() => undefined);
  return { ok: response.ok, status: response.status, payload };
};

// ------------------------------------------------------------ 2 · callables

await step('a callable answers', async () => {
  const answer = await callable('ingestProgress', { events: [] });

  assert(answer.ok, () => `ingestProgress answered ${answer.status}`);
  assert(answer.payload?.result, 'no result body');
  return 'ingestProgress';
});

await step('a callable still refuses what it should', async () => {
  // A guard that stopped guarding is as much a regression as one that started
  // refusing everything.
  const answer = await callable('submitReport', { reports: new Array(60).fill({}) });

  assert(!answer.ok, 'a 60-item batch was accepted where the limit is 50');
  assert(
    answer.payload?.error?.message === 'too-many-items',
    () => `refused as ${answer.payload?.error?.message}`
  );
  return 'batch limit enforced';
});

// ------------------------------------------------------- 3 · content download

await step('published content is downloadable', async () => {
  const snapshot = await db.collection('seeds').where('status', '==', 'published').limit(1).get();
  assert(!snapshot.empty, 'no published seeds');

  const seed = snapshot.docs[0].data();
  const revision = await db.doc(`seedRevisions/${snapshot.docs[0].id}_${seed.currentRevision}`).get();
  assert(revision.exists, 'the pointer names a revision that does not exist');

  const data = revision.data();
  assert(data.storagePath, 'the revision has no artifact path');
  assert(data.checksum, 'the revision has no checksum');
  return `${snapshot.docs[0].id}@${seed.currentRevision}`;
});

// ---------------------------------------------------------- 4 · crash path

const SYNTHETIC = `diagnose-${randomUUID()}`;
const route = '/diagnostics';

await step('a synthetic crash reaches the operator', async () => {
  const answer = await callable('recordTelemetryBatch', {
    crashes: [
      {
        id: SYNTHETIC,
        message: 'DananehDiagnostic: synthetic crash from the diagnose script',
        // Exactly what an operator needs to act: which build, where, and which
        // environment — and a session id to find the events around it.
        context: {
          route,
          env: EMULATED ? 'development' : 'staging',
          session_id: SYNTHETIC,
        },
        fatal: false,
        occurredAt: new Date().toISOString(),
        appVersion: process.env.DIAGNOSE_APP_VERSION ?? '1.0.0',
        appVariant: EMULATED ? 'development' : 'staging',
      },
    ],
  });

  assert(answer.ok, () => `recordTelemetryBatch answered ${answer.status}`);
  assert(answer.payload?.result?.applied === 1, () => JSON.stringify(answer.payload?.result));

  const stored = await db.doc(`crashReports/${SYNTHETIC}`).get();
  assert(stored.exists, 'the crash was accepted but never written');

  const report = stored.data();
  assert(report.appVersion, 'no app version on the report');
  assert(report.context?.route === route, () => `route is ${report.context?.route}`);
  assert(report.context?.env, 'no environment on the report');
  assert(report.uid === uid, 'the report was not attributed to the caller');

  return `${report.appVariant}@${report.appVersion} at ${report.context.route}`;
});

await step('the crash is visible in the day it happened', async () => {
  const { buildOpsDigest } = await import('../functions/lib/telemetry/retention.js').catch(
    () => ({})
  );
  assert(buildOpsDigest, 'run `npm run build:functions` first');

  const day = new Date().toISOString().slice(0, 10);
  const digest = await buildOpsDigest({ db, now: () => new Date() }, day);

  assert(digest.crashes >= 1, () => `the digest for ${day} counts ${digest.crashes} crashes`);
  assert(
    digest.topMessages.some((entry) => entry.message.includes('DananehDiagnostic')),
    'the synthetic crash is not in the day’s top messages'
  );
  return `${digest.crashes} crash(es), ${digest.affectedSessions} session(s)`;
});

// The synthetic crash is not left behind to be mistaken for a real one.
await step('the synthetic crash is cleaned up', async () => {
  await db.doc(`crashReports/${SYNTHETIC}`).delete();
  assert(!(await db.doc(`crashReports/${SYNTHETIC}`).get()).exists, 'it is still there');
  return 'removed';
});

console.log(results.join('\n'));

if (failures) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll diagnostics passed.\n');
