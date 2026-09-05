#!/usr/bin/env node
/**
 * Are the pages the app links to actually there?
 *
 * A link to a 404 is worse than no link: it looks answered. The About screen
 * offers a privacy policy, terms of use and a support address, and every one of
 * them has to resolve before a build reaches anybody outside the team — Play
 * asks for the first two, and a tester who hits a bug needs the third.
 *
 * Deliberately **not** in the unit suite. A test that reaches the network is a
 * test that fails on a train, and a green build must not depend on somebody
 * else's DNS. This is a release-time check, run explicitly:
 *
 *   npm run check:legal
 *
 * It reads the URLs from the app rather than from a list here, so a link
 * changed in the screen and forgotten here cannot pass.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const about = readFileSync(fileURLToPath(new URL('src/app/settings/about.tsx', root)), 'utf8');

const urls = [...new Set([...about.matchAll(/https:\/\/[^\s'"`]+/g)].map((match) => match[0]))];
const email = about.match(/SUPPORT_EMAIL = '([^']+)'/)?.[1];

const TIMEOUT_MS = Number(process.env.LEGAL_CHECK_TIMEOUT_MS ?? 15000);

let failures = 0;
const say = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${text}`);
};

console.log('\nLegal and support endpoints\n');

say(urls.length >= 2, `${urls.length} link(s) found in the About screen`);
say(Boolean(email) && /@/.test(email ?? ''), `support address: ${email ?? 'none'}`);

for (const url of urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // `redirect: follow` on purpose: a policy served from a CDN or a www
    // redirect is still a policy that opens.
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const type = response.headers.get('content-type') ?? '';

    say(
      response.ok && response.url.startsWith('https://'),
      `${url} → ${response.status}${response.url === url ? '' : ` (${response.url})`}`
    );
    // A 200 that returns a JSON error or an empty page is not a policy.
    say(type.includes('text/html'), `${url} serves HTML (${type || 'no content-type'})`);
  } catch (error) {
    say(false, `${url} → ${controller.signal.aborted ? `no answer in ${TIMEOUT_MS}ms` : String(error.message)}`);
  } finally {
    clearTimeout(timer);
  }
}

if (failures) {
  console.error(
    `\n${failures} check(s) failed. The build is not ready for anyone outside the team:\n` +
      '  publish the pages, or change LEGAL_URLS in src/app/settings/about.tsx.\n'
  );
  process.exit(1);
}

console.log('\nEvery endpoint the app links to resolves.\n');
