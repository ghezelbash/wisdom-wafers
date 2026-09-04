/**
 * Everything a fresh local environment needs to be usable.
 *
 * Not just enough to exercise the editorial flow — enough that the app itself
 * has something to show: staff accounts with the right claims, a reader to sign
 * in as, an app-gate configuration, real published content with its revision,
 * manifest and Storage bundle, and one draft still in the workflow.
 *
 * Content is **published through the real pipeline**, not written straight into
 * Firestore. A seeder that hand-writes catalogue documents is a seeder that can
 * disagree with the publisher, and the disagreement shows up as a checksum
 * failure on a device rather than here.
 *
 * Emulator-only by construction: it refuses to run against anything that is not
 * a `demo-` project.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT ?? 'demo-dananeh';
if (!projectId.startsWith('demo-')) {
  console.error(`Refusing to seed "${projectId}": this script is for emulators only.`);
  process.exit(1);
}

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

export const PASSWORD = 'dananeh-emulator';

const PEOPLE = [
  { email: 'editor@example.com', claims: { editor: true } },
  { email: 'reviewer@example.com', claims: { reviewer: true } },
  { email: 'admin@example.com', claims: { admin: true } },
  // An ordinary reader. Staff claims would change what the rules allow, so the
  // account used to walk the product must not have any.
  { email: 'reader@example.com', claims: {} },
];

async function ensureUser({ email, claims }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: PASSWORD, emailVerified: true });
  }
  await auth.setCustomUserClaims(user.uid, claims);
  return user;
}

/**
 * Compiles a TypeScript module from the app or the pipeline and imports it.
 *
 * The seeder runs the same code the app ships rather than a re-typed copy of
 * it, which is what stops the two drifting apart.
 */
const outDir = mkdtempSync(join(tmpdir(), 'dananeh-seed-'));

async function loadModule(relativePath, name) {
  const outfile = join(outDir, `${name}.mjs`);

  await build({
    entryPoints: [new URL(`../${relativePath}`, import.meta.url).pathname],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    // Bundled rather than externalised: the output lands in a temp directory,
    // where Node cannot resolve this project's dependencies.
    alias: {
      '@': new URL('../src', import.meta.url).pathname,
      '@dananeh/content-schema': new URL(
        '../packages/content-schema/src/index.ts',
        import.meta.url
      ).pathname,
    },
  });

  return import(outfile);
}

/** Uploads through the Storage emulator's REST API — no admin SDK client. */
async function putObject(path, body, contentType = 'application/json') {
  const url =
    `http://${STORAGE_HOST}/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o` +
    `?uploadType=media&name=${encodeURIComponent(path)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(`storage upload failed: ${response.status} ${await response.text()}`);
  }
  return `${BUCKET}/${path}`;
}

// ---------------------------------------------------------------- accounts

const [editor, , adminUser] = await Promise.all(PEOPLE.map(ensureUser));

// ------------------------------------------------------------- app config

/**
 * The app gate, in whichever state was asked for.
 *
 * `npm run seed:emulator -- --gate=maintenance` and `--gate=update-required`
 * put the local environment into the two states that are otherwise only
 * reachable by hand-editing Firestore — which is how they went untested.
 *
 * The default is open, with `minimumVersion` `0.0.0`: a local environment that
 * locks out the build sitting next to it is one nobody can use.
 */
const gateArg = process.argv.find((arg) => arg.startsWith('--gate='))?.split('=')[1] ?? 'open';
const GATES = {
  open: { maintenance: false, minimumVersion: '0.0.0' },
  maintenance: {
    maintenance: true,
    maintenanceMessage: 'به‌روزرسانی محتوا',
    maintenanceUntil: '۱۵:۰۰',
    minimumVersion: '0.0.0',
  },
  'update-required': { maintenance: false, minimumVersion: '99.0.0' },
};

if (!GATES[gateArg]) {
  console.error(`Unknown gate "${gateArg}". One of: ${Object.keys(GATES).join(', ')}`);
  process.exit(1);
}

/**
 * Flags may be turned off from the command line too, to check that a kill
 * switch reaches the feature it names:
 *   npm run seed:emulator -- --off=reviewEnabled,downloadsEnabled
 */
const off = new Set(
  (process.argv.find((arg) => arg.startsWith('--off='))?.split('=')[1] ?? '')
    .split(',')
    .filter(Boolean)
);

await db.collection('appConfig').doc('public').set({
  ...GATES[gateArg],
  flags: {
    downloadsEnabled: !off.has('downloadsEnabled'),
    reviewEnabled: !off.has('reviewEnabled'),
    remindersEnabled: !off.has('remindersEnabled'),
    aiTutorEnabled: false,
  },
  updatedAt: new Date().toISOString(),
});

// ------------------------------------------------------- published content

const { LAUNCH_SEEDS } = await loadModule('src/data/content-repository.ts', 'catalog');
const { TOPICS } = await loadModule('src/data/topics.ts', 'topics');
const { PATHS } = await loadModule('src/data/paths.ts', 'paths');
const { publishSeed } = await loadModule('functions/src/publish/publish-seed.ts', 'publish');

const deps = {
  db,
  putObject,
  async deleteObjects() {
    return 0;
  },
  async deleteAuthUser() {},
  now: () => new Date(),
};

const published = [];
for (const seed of LAUNCH_SEEDS) {
  // Keyed on the *revision*, not the catalogue pointer: re-seeding after the
  // editorial workflow has published a correction must not try to republish an
  // immutable revision, which is refused.
  const revision = await db.collection('seedRevisions').doc(`${seed.id}_${seed.revision}`).get();
  if (revision.exists && revision.data()?.status === 'published') {
    published.push(`${seed.id}@${seed.revision} (already published)`);
    continue;
  }
  const result = await publishSeed(deps, { seed, actorUid: editor.uid });
  published.push(`${seed.id}@${result.revision}`);
}

// Topics and paths are catalogue metadata; the client filters on `published`.
for (const topic of TOPICS) {
  await db.collection('topics').doc(topic.id).set({ ...topic, status: 'published' });
}
for (const path of PATHS) {
  await db.collection('paths').doc(path.id).set({ ...path, status: 'published' });
}

// -------------------------------------------------------------- editorial

/**
 * The draft is a *correction* to something already published, at the next
 * revision — which is the only shape that can actually complete the workflow,
 * because a published revision is immutable and republishing one is refused.
 */
const draftSeed = { ...LAUNCH_SEEDS[0], revision: LAUNCH_SEEDS[0].revision + 1 };

await db.collection('cmsDrafts').doc('draft-1').set({
  draftId: 'draft-1',
  state: 'draft',
  authorUid: editor.uid,
  seed: draftSeed,
  updatedAt: new Date().toISOString(),
});

/**
 * A draft the *admin* wrote.
 *
 * An editor is stopped from reviewing by their claims alone, so the
 * self-approval rule can only be exercised by someone who holds a reviewing
 * role and authored the draft — which is exactly an admin.
 */
await db.collection('cmsDrafts').doc('draft-admin').set({
  draftId: 'draft-admin',
  state: 'draft',
  authorUid: adminUser.uid,
  seed: { ...LAUNCH_SEEDS[0], revision: LAUNCH_SEEDS[0].revision + 2 },
  updatedAt: new Date().toISOString(),
});

// ----------------------------------------------------------------- report

console.log('Seeded emulator:');
for (const person of PEOPLE) {
  const role = Object.keys(person.claims)[0] ?? 'reader';
  console.log(`  ${person.email} / ${PASSWORD}  (${role})`);
}
console.log(
  `  appConfig/public — gate ${gateArg}${off.size ? `, off: ${[...off].join(', ')}` : ''}`
);
console.log(`  published: ${published.join(', ')}`);
console.log(`  topics: ${TOPICS.length}, paths: ${PATHS.length}`);
console.log(
  `  cmsDrafts/draft-1 in state "draft" (${draftSeed.id}@${draftSeed.revision}, a correction)`
);
console.log('  cmsDrafts/draft-admin in state "draft", authored by admin');
process.exit(0);
