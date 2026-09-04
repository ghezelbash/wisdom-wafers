/**
 * Puts enough into the emulator to exercise the editorial flow:
 * an editor, a reviewer, an admin, and one draft to move through it.
 *
 * Emulator-only by construction — it refuses to run against anything that is
 * not a `demo-` project.
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

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const PEOPLE = [
  { email: 'editor@example.com', claims: { editor: true } },
  { email: 'reviewer@example.com', claims: { reviewer: true } },
  { email: 'admin@example.com', claims: { admin: true } },
];

const password = 'dananeh-emulator';

async function ensureUser({ email, claims }) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true });
  }
  await auth.setCustomUserClaims(user.uid, claims);
  return user;
}

/**
 * The draft is the real authored fixture, compiled rather than re-typed, so the
 * CMS is exercising the same content the app ships.
 */
const outDir = mkdtempSync(join(tmpdir(), 'dananeh-seed-'));
const outFile = join(outDir, 'fixture.mjs');

await build({
  entryPoints: [new URL('../src/data/seeds/sky-darkness.ts', import.meta.url).pathname],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  alias: {
    '@': new URL('../src', import.meta.url).pathname,
    '@dananeh/content-schema': new URL(
      '../packages/content-schema/src/index.ts',
      import.meta.url
    ).pathname,
  },
});

const { skyDarknessSeed: seed } = await import(outFile);

const [editor] = await Promise.all(PEOPLE.map(ensureUser));

await db.collection('cmsDrafts').doc('draft-1').set({
  draftId: 'draft-1',
  state: 'draft',
  authorUid: editor.uid,
  seed,
  updatedAt: new Date().toISOString(),
});

console.log('Seeded emulator:');
for (const person of PEOPLE) console.log(`  ${person.email} / ${password}`);
console.log('  cmsDrafts/draft-1 in state "draft"');
process.exit(0);
