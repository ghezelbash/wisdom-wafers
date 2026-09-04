#!/usr/bin/env node
/**
 * The local full stack, proven rather than assumed.
 *
 * Signs in as the seeded reader, reads the published catalogue, downloads a
 * bundle from Storage and verifies its checksum, then calls two real callables
 * through the Functions emulator and checks what they wrote.
 *
 * Everything goes over the wire the way the app does — HTTP to the emulators,
 * with a real ID token — so a broken adapter, a missing function, an emulator
 * that was never started or a rule that denies the write all show up here
 * rather than on a device.
 *
 * Emulator-only by construction.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = process.env.FIREBASE_PROJECT ?? 'demo-dananeh';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to smoke-test "${PROJECT}": this script is for emulators only.`);
  process.exit(1);
}

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181';
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
const FUNCTIONS = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const REGION = 'europe-west1';
const BUCKET = `${PROJECT}.appspot.com`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;

const READER = { email: 'reader@example.com', password: 'dananeh-emulator' };

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

/**
 * `message` is a function, not a string.
 *
 * A template literal is evaluated eagerly even when the assertion passes, so
 * building one out of a possibly-absent value throws *inside the check* and
 * hides whatever actually happened.
 */
const assert = (condition, message) => {
  if (!condition) throw new Error(typeof message === 'function' ? message() : message);
};

const brief = (value) => String(JSON.stringify(value) ?? value).slice(0, 200);

// The checksum implementation the publisher and the device both use.
const outDir = mkdtempSync(join(tmpdir(), 'dananeh-smoke-'));
await build({
  entryPoints: [new URL('../packages/content-schema/src/index.ts', import.meta.url).pathname],
  outfile: join(outDir, 'schema.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { verifyChecksum, parseBundleLenient } = await import(join(outDir, 'schema.mjs'));

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'smoke'));

// ------------------------------------------------------------ reachability

const reachable = async (label, url) => {
  const response = await fetch(url).catch((error) => {
    throw new Error(`${label} unreachable: ${error.message}`);
  });
  assert(response.status < 500, `${label} answered ${response.status}`);
};

await step('Auth emulator is reachable', () => reachable('auth', `http://${AUTH}/`));
await step('Firestore emulator is reachable', () => reachable('firestore', `http://${FIRESTORE}/`));
// The root path answers 501; the bucket endpoint is the one that proves the
// service is actually up.
await step('Storage emulator is reachable', () =>
  reachable('storage', `http://${STORAGE}/v0/b/${encodeURIComponent(BUCKET)}/o`)
);
await step('Functions emulator is reachable', () =>
  reachable('functions', `http://${FUNCTIONS}/${PROJECT}/${REGION}/ingestProgress`)
);

// -------------------------------------------------------------------- auth

let idToken = '';
let uid = '';

await step('a seeded reader can sign in', async () => {
  const response = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...READER, returnSecureToken: true }),
    }
  );
  assert(response.ok, `sign-in answered ${response.status} — did you run \`npm run seed:emulator\`?`);

  const data = await response.json();
  idToken = data.idToken;
  uid = data.localId;
  assert(idToken && uid, 'no token returned');
  return READER.email;
});

// --------------------------------------------------------------- catalogue

let manifest = null;

await step('the published catalogue has content', async () => {
  const snapshot = await db.collection('seeds').where('status', '==', 'published').get();
  assert(snapshot.size > 0, 'no published seeds — run `npm run seed:emulator`');

  const data = snapshot.docs[0].data();
  manifest = {
    seedId: data.seedId,
    revision: data.revision,
    storagePath: data.storagePath,
    checksum: data.checksum,
    bytes: data.bytes,
  };
  assert(manifest.storagePath && manifest.checksum, 'catalogue document carries no manifest');
  return `${snapshot.size} seed(s), first is ${manifest.seedId}@${manifest.revision}`;
});

await step('its bundle downloads from Storage and verifies', async () => {
  assert(manifest, 'no manifest to fetch');

  const url =
    `http://${STORAGE}/v0/b/${encodeURIComponent(BUCKET)}/o/` +
    `${encodeURIComponent(manifest.storagePath)}?alt=media`;

  const response = await fetch(url);
  assert(response.ok, `storage answered ${response.status}`);

  const body = await response.text();
  const parsed = parseBundleLenient(JSON.parse(body));
  assert(parsed.ok, 'bundle does not parse');
  assert(verifyChecksum(parsed.value, manifest.checksum), 'checksum does not match the catalogue');

  return `${body.length} bytes, checksum verified`;
});

// ----------------------------------------------------------- the callables

const callable = async (name, data) => {
  const response = await fetch(`http://${FUNCTIONS}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });

  const payload = await response.json().catch(() => undefined);
  assert(response.ok, () => `${name} answered ${response.status}: ${brief(payload)}`);
  assert(payload, () => `${name} returned no JSON body`);
  assert(!payload.error, () => `${name} returned an error: ${brief(payload.error)}`);
  assert(payload.result, () => `${name} returned no result: ${brief(payload)}`);
  return payload.result;
};

const stamp = Date.now();

await step('a progress event reaches ingestProgress and is persisted', async () => {
  const result = await callable('ingestProgress', {
    events: [
      {
        id: `smoke-progress-${stamp}`,
        uid,
        seedId: manifest.seedId,
        revision: manifest.revision,
        type: 'completed',
        occurredAtDevice: new Date().toISOString(),
        timezone: 'Asia/Tehran',
        appVersion: '1.0.0',
      },
    ],
  });
  assert(result.applied === 1, () => `applied ${result.applied}, rejected ${brief(result.rejected)}`);

  const progress = await db.doc(`users/${uid}/progress/${manifest.seedId}`).get();
  assert(progress.exists, 'no progress document was written');
  assert(progress.data().status === 'completed', () => `status is ${progress.data().status}`);
  return 'completion recorded';
});

await step('the same event a second time counts once', async () => {
  const result = await callable('ingestProgress', {
    events: [
      {
        id: `smoke-progress-${stamp}`,
        uid,
        seedId: manifest.seedId,
        revision: manifest.revision,
        type: 'completed',
        occurredAtDevice: new Date().toISOString(),
        timezone: 'Asia/Tehran',
        appVersion: '1.0.0',
      },
    ],
  });
  assert(result.duplicates === 1, () => `duplicates ${result.duplicates}, applied ${result.applied}`);
  return 'idempotent on event id';
});

await step('a content report reaches submitReport and lands in Firestore', async () => {
  const id = `smoke-report-${stamp}`;
  const result = await callable('submitReport', {
    reports: [
      {
        id,
        uid,
        seedId: manifest.seedId,
        revision: manifest.revision,
        category: 'factual',
        detail: 'گزارش آزمایشی از smoke test',
        occurredAtDevice: new Date().toISOString(),
        appVersion: '1.0.0',
      },
    ],
  });
  assert(result.applied === 1, () => `applied ${result.applied}`);

  const report = await db.doc(`reports/${id}`).get();
  assert(report.exists, 'no report document was written');
  assert(report.data().status === 'open', () => `status is ${report.data().status}`);
  return 'report triaged as open';
});

await step('telemetry reaches recordTelemetryBatch', async () => {
  const result = await callable('recordTelemetryBatch', {
    events: [
      {
        id: `smoke-telemetry-${stamp}`,
        name: 'seed_completed',
        params: { seed_id: manifest.seedId, duration_ms: 1000, interaction_count: 3 },
        occurredAt: new Date().toISOString(),
        appVersion: '1.0.0',
        appVariant: 'development',
      },
    ],
  });
  assert(result.applied === 1, () => `applied ${result.applied}`);
  return 'funnel event recorded';
});

/** The guard has to hold over the wire, not only in a unit test. */
await step('telemetry carrying free text is refused', async () => {
  const result = await callable('recordTelemetryBatch', {
    events: [
      {
        id: `smoke-pii-${stamp}`,
        name: 'search_performed',
        params: { query: 'پارادوکس اولبرس' },
        occurredAt: new Date().toISOString(),
        appVersion: '1.0.0',
        appVariant: 'development',
      },
    ],
  });
  assert(result.applied === 0, 'an event with a free-text parameter was accepted');
  assert(result.rejected?.length === 1, 'no rejection reason returned');
  return result.rejected[0].reason;
});

// ------------------------------------------------------- editorial workflow

/**
 * What the CMS does, over the same callables it calls.
 *
 * The roles come from custom claims the seeder set, so this exercises the
 * claims, the rules and the state machine together — including the one rule
 * the workflow exists for.
 */
const signIn = async (email) => {
  const response = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: READER.password, returnSecureToken: true }),
    }
  );
  assert(response.ok, () => `sign-in for ${email} answered ${response.status}`);
  return (await response.json()).idToken;
};

const asUser = async (token, name, data) => {
  const previous = idToken;
  idToken = token;
  try {
    return await callable(name, data);
  } finally {
    idToken = previous;
  }
};

const expectRefusal = async (token, name, data, reason) => {
  try {
    await asUser(token, name, data);
  } catch (error) {
    assert(error.message.includes(reason), () => `refused, but for "${error.message}"`);
    return;
  }
  throw new Error(`${name} was allowed when it should have been refused`);
};

let editorToken = '';
let reviewerToken = '';

await step('staff accounts sign in with their claims', async () => {
  editorToken = await signIn('editor@example.com');
  reviewerToken = await signIn('reviewer@example.com');
  assert(editorToken && reviewerToken, 'no tokens');
  return 'editor and reviewer';
});

await step('an editor submits a draft for review', async () => {
  const state = (await db.doc('cmsDrafts/draft-1').get()).data()?.state;
  if (state !== 'draft' && state !== 'changes_requested') {
    return `already ${state} — nothing to submit`;
  }
  const result = await asUser(editorToken, 'submitForReview', { draftId: 'draft-1' });
  assert(result.state === 'in_review', () => `state is ${result.state}`);
  return 'in_review';
});

/** An editor holds no reviewing role, so they are stopped before authorship
 *  is even considered. */
await step('an editor cannot review at all', () =>
  expectRefusal(editorToken, 'review', { draftId: 'draft-1', decision: 'approve' }, 'staff-only')
);

/**
 * The rule the whole workflow exists for.
 *
 * It can only be reached by someone who *may* review and wrote the draft — an
 * admin. An editor never gets that far, so testing it with one proves nothing.
 */
await step('an admin cannot approve a draft they wrote themselves', async () => {
  const adminToken = await signIn('admin@example.com');
  const state = (await db.doc('cmsDrafts/draft-admin').get()).data()?.state;

  if (state === 'draft' || state === 'changes_requested') {
    await asUser(adminToken, 'submitForReview', { draftId: 'draft-admin' });
  }

  await expectRefusal(
    adminToken,
    'review',
    { draftId: 'draft-admin', decision: 'approve' },
    'self-approval'
  );
  return 'refused as self-approval';
});

await step('a reviewer approves it', async () => {
  const state = (await db.doc('cmsDrafts/draft-1').get()).data()?.state;
  if (state === 'approved' || state === 'published') return `already ${state}`;

  const result = await asUser(reviewerToken, 'review', {
    draftId: 'draft-1',
    decision: 'approve',
    note: 'خوانده شد',
  });
  assert(result.state === 'approved', () => `state is ${result.state}`);
  return 'approved';
});

await step('the editor publishes the approved draft', async () => {
  const draft = (await db.doc('cmsDrafts/draft-1').get()).data();
  if (draft?.state === 'published') return 'already published';

  // A published revision is immutable, so a re-run whose draft revision is
  // already live has nothing to publish. That is the pipeline behaving, not a
  // failure — the seeder bumps the draft when the catalogue moves on.
  const live = await db.doc(`seedRevisions/${draft.seed.id}_${draft.seed.revision}`).get();
  if (live.exists && live.data()?.status === 'published') {
    return `${draft.seed.id}@${draft.seed.revision} was already published`;
  }

  const result = await asUser(editorToken, 'publishApproved', { draftId: 'draft-1' });
  const seed = await db.doc(`seeds/${result.seedId}`).get();
  assert(seed.data()?.currentRevision === result.revision, 'the catalogue pointer did not move');
  return `${result.seedId}@${result.revision} is live`;
});

await step('the audit trail records who did what', async () => {
  const snapshot = await db.collection('cmsReviews').where('draftId', '==', 'draft-1').get();
  assert(snapshot.size >= 2, () => `only ${snapshot.size} audit entries`);
  return `${snapshot.size} transitions recorded`;
});

// ------------------------------------------------------------------ report

console.log('\nLocal full-stack smoke test');
console.log(`  project ${PROJECT} · auth ${AUTH} · firestore ${FIRESTORE}`);
console.log(`  storage ${STORAGE} · functions ${FUNCTIONS}\n`);
for (const line of results) console.log(line);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll local full-stack checks passed.');
process.exit(0);
