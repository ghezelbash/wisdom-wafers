#!/usr/bin/env node
/**
 * Bringing a real project up to a state the app can run against.
 *
 * The emulator seeder refuses to touch anything that is not a `demo-` project,
 * deliberately. This is its counterpart for a real one: the same steps, the
 * same real pipeline, and the same property — **idempotent**, so it can be run
 * again after a partial failure or a rules change without producing a second
 * copy of anything.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=… FIREBASE_PROJECT=dananeh-staging \
 *     npm run bootstrap:project -- --confirm
 *
 * `--confirm` is required, and the project id must be passed explicitly: a
 * script that writes to whatever project happened to be in the environment is
 * one command away from writing to production.
 *
 * What it does, in order:
 *
 *   1. staff accounts and their custom claims (synthetic, for the CMS roles);
 *   2. `appConfig/public` — the gate, the minimum version, the flags;
 *   3. the launch catalogue, **through `publishSeed`** — validated strictly,
 *      compiled, checksummed, uploaded, then the pointer moved in a
 *      transaction. Never a hand-written Firestore document;
 *   4. topics and paths.
 *
 * It never deletes and never overwrites a published revision: a revision that
 * is already live is immutable, so it is left alone and reported.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT;
const confirmed = process.argv.includes('--confirm');

if (!projectId) {
  console.error('Set FIREBASE_PROJECT to the project to bootstrap.');
  process.exit(1);
}
if (projectId.startsWith('demo-')) {
  console.error(`"${projectId}" is an emulator project — use \`npm run seed:emulator\`.`);
  process.exit(1);
}
if (!confirmed) {
  console.error(`This writes to the real project "${projectId}". Re-run with --confirm.`);
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.');
  process.exit(1);
}

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`;

const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket: BUCKET });
const auth = getAuth(app);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const done = [];
const note = (line) => {
  done.push(`  ${line}`);
  console.log(`  ${line}`);
};

console.log(`\nBootstrapping ${projectId}\n`);

// ------------------------------------------------------------------ staff

/**
 * Synthetic staff, for the editorial roles the CMS checks.
 *
 * Passwords are not set here and never printed: the owner sends a reset link
 * from the console. A bootstrap script that mints a password writes it into a
 * terminal history, a CI log, or both.
 */
const STAFF = [
  { email: process.env.STAGING_EDITOR_EMAIL, claims: { editor: true }, role: 'editor' },
  { email: process.env.STAGING_REVIEWER_EMAIL, claims: { reviewer: true }, role: 'reviewer' },
  { email: process.env.STAGING_ADMIN_EMAIL, claims: { admin: true }, role: 'admin' },
];

const staff = {};

for (const person of STAFF) {
  if (!person.email) {
    note(`· no ${person.role} address given (STAGING_${person.role.toUpperCase()}_EMAIL) — skipped`);
    continue;
  }

  const user = await auth.getUserByEmail(person.email).catch(() => null);
  const record = user ?? (await auth.createUser({ email: person.email, emailVerified: false }));

  // Set every time: a claim that drifted is repaired by re-running this.
  await auth.setCustomUserClaims(record.uid, person.claims);
  staff[person.role] = record;
  note(`${person.role}: ${person.email} ${user ? '(existing)' : '(created)'}`);
}

// -------------------------------------------------------------- app config

const config = {
  minimumVersion: process.env.MINIMUM_VERSION ?? '1.0.0',
  maintenance: false,
  flags: {},
  updatedAt: new Date().toISOString(),
};

// Merged, not replaced: an operator may have flipped maintenance or narrowed a
// flag from the console, and a bootstrap must not undo that silently.
await db.doc('appConfig/public').set(config, { merge: true });
note(`appConfig/public — minimum version ${config.minimumVersion}, maintenance off`);

// ------------------------------------------------------------ the pipeline

const outDir = mkdtempSync(join(tmpdir(), 'dananeh-bootstrap-'));

async function loadModule(relativePath, name) {
  const outfile = join(outDir, `${name}.mjs`);
  await build({
    entryPoints: [new URL(`../${relativePath}`, import.meta.url).pathname],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    external: ['firebase-admin', 'firebase-functions', 'react', 'react-native'],
    define: { __DEV__: 'false' },
  });
  return import(outfile);
}

const { LAUNCH_SEEDS } = await loadModule('src/data/content-repository.ts', 'catalog');
const { TOPICS } = await loadModule('src/data/topics.ts', 'topics');
const { PATHS } = await loadModule('src/data/paths.ts', 'paths');
const { publishSeed } = await loadModule('functions/src/publish/publish-seed.ts', 'publish');

const deps = {
  db,
  async putObject(path, body, contentType = 'application/json', options = {}) {
    const file = bucket.file(path);
    await file.save(body, {
      contentType,
      resumable: false,
      ...(options.ifAbsent ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
    });
    return `${bucket.name}/${path}`;
  },
  async deleteObjects() {
    return 0;
  },
  async deleteAuthUser() {},
  now: () => new Date(),
};

const publisher = staff.editor?.uid ?? staff.admin?.uid;
if (!publisher) {
  console.error('\nNo editor or admin account, so nothing can be published. Set the addresses and re-run.');
  process.exit(1);
}

for (const seed of LAUNCH_SEEDS) {
  // Keyed on the revision document, not the catalogue pointer: a revision that
  // is already live is immutable, and republishing it is refused.
  const revision = await db.doc(`seedRevisions/${seed.id}_${seed.revision}`).get();

  if (revision.exists && revision.data()?.status === 'published') {
    note(`${seed.id}@${seed.revision} already published — left alone`);
    continue;
  }

  const result = await publishSeed(deps, { seed, actorUid: publisher });
  note(`published ${seed.id}@${result.revision} — ${result.checksum.slice(0, 12)}…`);
}

for (const topic of TOPICS) {
  await db.doc(`topics/${topic.id}`).set({ ...topic, status: 'published' }, { merge: true });
}
note(`${TOPICS.length} topics`);

for (const path of PATHS) {
  await db.doc(`paths/${path.id}`).set({ ...path, status: 'published' }, { merge: true });
}
note(`${PATHS.length} paths`);

console.log(`\n${projectId} is bootstrapped. Run \`npm run verify:env\` to confirm it answers.\n`);
