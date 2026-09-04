#!/usr/bin/env node
/**
 * The end-to-end flows, checked without a device.
 *
 * The suite could not fail. Not "did not fail" — *could not*: it referenced
 * `id: "email"` when the app had **no `testID` anywhere at all**, and marked the
 * tap optional, so the step passed by not happening. Several assertions named a
 * segment label that is on screen whether or not anything survived, and the
 * signup flow typed `beta-${maestro.copiedText}@example.com` with nothing ever
 * copied.
 *
 * A device run would not have caught any of it — it would have gone green. So
 * these checks are static, run in CI, and answer the only question that matters
 * before the device is even switched on: could this flow fail?
 *
 *   npm run check:e2e
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const flowsDir = join(root, '.maestro');

let failures = 0;
const lines = [];
const say = (ok, text) => {
  if (!ok) failures += 1;
  lines.push(`  ${ok ? '✓' : '✗'} ${text}`);
};

// --------------------------------------------------- every testID in the app

const SKIP = new Set(['node_modules', '__tests__', '__fixtures__']);

function sources(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(readFileSync(full, 'utf8'));
  }
  return found;
}

const code = sources(join(root, 'src')).join('\n');

/** Literal ids, plus the template forms the app builds from a known list. */
const literalIds = new Set([...code.matchAll(/testID="([^"]+)"/g)].map((m) => m[1]));
const templateIds = [...code.matchAll(/testID=\{`([^`]+)`\}/g)].map((m) => m[1]);

const TAB_ROUTES = ['index', 'explore', 'garden', 'profile'];
const GARDEN_SEGMENTS = ['inProgress', 'saved', 'downloaded', 'due', 'completed'];

for (const template of templateIds) {
  if (template === 'tab-${route.name}') TAB_ROUTES.forEach((r) => literalIds.add(`tab-${r}`));
  else if (template === 'garden-segment-${id}')
    GARDEN_SEGMENTS.forEach((s) => literalIds.add(`garden-segment-${s}`));
  // `download-${seedId}` is per seed: matched by prefix below.
}

const PREFIXES = templateIds
  .filter((t) => t.startsWith('download-'))
  .map(() => 'download-');

// -------------------------------------------------------------- the flows

const flows = readdirSync(flowsDir)
  .filter((name) => /^\d.*\.yaml$/.test(name))
  .sort();

say(flows.length >= 9, `${flows.length} flows found`);

const known = (id) => {
  const resolved = id.replace(/\$\{[^}]+\}/g, '');
  if (literalIds.has(id)) return true;
  return PREFIXES.some((prefix) => resolved.startsWith(prefix) || id.startsWith(prefix));
};

for (const name of flows) {
  const text = readFileSync(join(flowsDir, name), 'utf8');
  const ids = [...text.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);

  const unknown = ids.filter((id) => !known(id));
  say(unknown.length === 0, `${name}: every id exists in the app${unknown.length ? ` — missing: ${unknown.join(', ')}` : ` (${ids.length})`}`);

  // A flow with nothing but taps proves nothing.
  const assertions = (text.match(/assert(Visible|NotVisible)|extendedWaitUntil/g) ?? []).length;
  say(assertions > 0, `${name}: asserts something (${assertions})`);

  // `maestro.copiedText` with nothing copied is how the signup flow got its
  // address. If a flow copies first, it is fine; none do.
  say(
    !text.includes('maestro.copiedText') || text.includes('copyTextFrom'),
    `${name}: no copiedText without a copy`
  );

  // `.*` matches every screen ever rendered.
  say(!/assertVisible:\s*\n\s*text:\s*"\.\*"/.test(text), `${name}: no assertion that matches anything`);
}

// ---------------------------------------------------------- optional taps

const optionalByFlow = flows.map((name) => ({
  name,
  count: (readFileSync(join(flowsDir, name), 'utf8').match(/optional:\s*true/g) ?? []).length,
}));

// Exactly one flow may use them: the player walk, where each block type puts a
// different CTA on screen and the assertion after the loop is what fails.
const offenders = optionalByFlow.filter(
  (flow) => flow.count > 0 && !flow.name.startsWith('03-')
);
say(
  offenders.length === 0,
  `optional taps confined to the player walk${offenders.length ? ` — also in ${offenders.map((f) => f.name).join(', ')}` : ''}`
);

// ------------------------------------------------------ what must be covered

const all = flows.map((name) => readFileSync(join(flowsDir, name), 'utf8')).join('\n');

const REQUIRED = [
  ['a deterministic address from the runner', /DANANEH_E2E_EMAIL/],
  ['both fields filled at signup', /auth-email[\s\S]*auth-password/],
  ['guest progress asserted after linking', /after-signup/],
  ['a real download before going offline', /download-\$\{SEED_ID\}/],
  ['the offline half asserts the corrupt state is absent', /فایل این دانه سالم نیست/],
  ['a refused deep link asserted in the app', /openLink[\s\S]*evil\.example/],
  ['notification routing', /notification-route/],
  ['deletion re-authenticates when asked', /delete-reauth/],
  ['deletion verified against what is left', /assertNotVisible:\s*\n\s*id: "profile-create-account"|profile-create-account/],
];

for (const [what, pattern] of REQUIRED) say(pattern.test(all), `covered: ${what}`);

console.log(`\nMaestro flow checks · ${flows.length} flows\n`);
console.log(lines.join('\n'));

if (failures) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('\nAll flow checks passed.\n');
