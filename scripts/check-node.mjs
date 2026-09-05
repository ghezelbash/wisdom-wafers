#!/usr/bin/env node
/**
 * The Node the functions will actually run on.
 *
 * `functions/package.json` declares `"node": "22"`, which is what Cloud
 * Functions provisions. Everything local was being built and tested on Node 26
 * instead — a silent substitution, and the kind that is only discovered when
 * something that works on the newer runtime is missing from the older one.
 *
 * So the mismatch is an error rather than a habit. `.nvmrc` names the version,
 * `engines` records it, and this fails the build that would otherwise have
 * compiled the functions on the wrong one.
 *
 *   nvm use            # or: export PATH="$(brew --prefix node@22)/bin:$PATH"
 *   npm run check:node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const declared = JSON.parse(
  readFileSync(fileURLToPath(new URL('functions/package.json', root)), 'utf8')
).engines?.node;

const wanted = Number(String(declared).match(/\d+/)?.[0]);
const running = Number(process.versions.node.split('.')[0]);

if (!wanted) {
  console.error('functions/package.json declares no Node engine.');
  process.exit(1);
}

if (running !== wanted) {
  console.error(
    `\nCloud Functions runs Node ${wanted}; this is Node ${process.versions.node}.\n\n` +
      'Building or testing the functions on a different major is a silent\n' +
      'substitution — it works here and may not there. Switch first:\n\n' +
      '  nvm use\n' +
      `  export PATH="$(brew --prefix node@${wanted})/bin:$PATH"\n\n` +
      'Set DANANEH_ALLOW_NODE_MISMATCH=1 to override deliberately.\n'
  );
  if (process.env.DANANEH_ALLOW_NODE_MISMATCH !== '1') process.exit(1);
}

console.log(`Node ${process.versions.node} matches the Cloud Functions runtime (${wanted}).`);
