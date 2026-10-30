#!/usr/bin/env node
/**
 * One file to deploy, with the shared schema inside it.
 *
 * `functions/package.json` depended on `@dananeh/content-schema: "*"`, which is
 * a **workspace** package — it exists in this repository and nowhere else.
 * Locally that resolves through the workspace root and everything passes: the
 * emulator runs, the tests run, `tsc` is happy. Cloud Build uploads the
 * `functions/` directory on its own and runs `npm install` inside it, with no
 * workspace root above, so npm went looking on the public registry:
 *
 *     npm error 404 '@dananeh/content-schema@*' is not in this registry.
 *
 * Every function failed to build. Nothing local could have caught it — the gap
 * only exists once the directory is separated from the repository it lives in.
 *
 * So the deployed entry point is bundled: the schema is compiled into it, and
 * the package the runtime installs declares only what genuinely comes from the
 * registry. `tsc` still emits the plain `lib/` tree beside it, because the
 * diagnostics script imports individual modules from there.
 *
 * `firebase-functions` and `firebase-admin` stay external. They are real
 * dependencies of the runtime, the platform expects to see them in
 * `package.json`, and `firebase-admin` in particular resolves native pieces
 * that must not be inlined.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const entry = fileURLToPath(new URL('functions/src/index.ts', root));
const outfile = fileURLToPath(new URL('functions/lib/index.bundle.js', root));

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // Everything the Cloud Functions runtime installs for itself.
  external: ['firebase-functions', 'firebase-functions/*', 'firebase-admin', 'firebase-admin/*'],
  // Deploy failures are read in a log days later; the mapping is worth the size.
  sourcemap: 'inline',
  logLevel: 'info',
});

console.log(`Bundled functions entry point -> ${outfile.replace(fileURLToPath(root), '')}`);
