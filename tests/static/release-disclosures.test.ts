import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a build cannot be distributed without.
 *
 * A privacy policy, terms, a support address, the version and build number, and
 * a statement of how to delete an account — Play asks for every one, and a
 * tester who hits a bug has nowhere to write without the last. None of them
 * existed in the app.
 *
 * Static, because the failure mode is a placeholder that ships: a policy URL
 * that points at a page nobody has published looks exactly like one that does,
 * right up until someone taps it.
 */

const ROOT = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const about = read('src/app/settings/about.tsx');
const fa = JSON.parse(read('src/locales/fa.json'));
const en = JSON.parse(read('src/locales/en.json'));

describe('the about screen', () => {
  it('exists and is reachable from the profile', () => {
    expect(existsSync(join(ROOT, 'src/app/settings/about.tsx'))).toBe(true);
    expect(read('src/app/(tabs)/profile.tsx')).toContain('/settings/about');
  });

  it('names the version and the build number, not just the version', () => {
    // Three internal APKs share `1.0.0`. "Which build were you on?" is the
    // first question a crash report has to answer.
    expect(about).toContain('appVersion()');
    expect(about).toContain('buildNumber()');
    expect(about).toContain('appVariant()');
  });

  it('offers a privacy policy, terms and a support address', () => {
    expect(about).toContain('about-privacy');
    expect(about).toContain('about-terms');
    expect(about).toContain('about-support');
  });

  /**
   * The requirement is that deletion is *described* and *reachable* in the same
   * place. A policy page that mentions it while the app hides it satisfies
   * neither half.
   */
  it('describes account deletion and links to where it happens', () => {
    expect(about).toContain('about-delete-account');
    expect(about).toContain('/settings/delete-account');
    expect(fa.about.deletionBody.length).toBeGreaterThan(40);
    expect(en.about.deletionBody.length).toBeGreaterThan(40);
  });

  it('states what leaves the device and what does not', () => {
    for (const copy of [fa.about.dataBody, en.about.dataBody]) {
      expect(copy.length).toBeGreaterThan(60);
    }
    // The three specific promises made elsewhere in the app, restated here.
    expect(en.about.dataBody).toMatch(/[Rr]eflections/);
    expect(en.about.dataBody).toMatch(/account/);
    expect(en.about.dataBody).toMatch(/search/i);
  });

  it('is translated in both languages, with no key missing', () => {
    expect(Object.keys(fa.about).sort()).toEqual(Object.keys(en.about).sort());
    for (const [key, value] of Object.entries(fa.about)) {
      expect([key, String(value).trim().length > 0]).toEqual([key, true]);
    }
  });
});

describe('the policy URLs', () => {
  const urls = [...about.matchAll(/https:\/\/[^\s'"]+/g)].map((match) => match[0]);

  it('are declared in one place rather than inline at each link', () => {
    expect(about).toContain('LEGAL_URLS');
  });

  it('point at a real host over https', () => {
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const url of urls) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).not.toMatch(/example\.com|localhost|TODO|changeme/i);
    }
  });

  /**
   * Whether they *resolve* is checked by `npm run check:legal`, not here.
   *
   * A unit test that reaches the network is one that fails on a train, and a
   * green build must not depend on somebody else's DNS. What this asserts is
   * that the check exists, runs the same URLs, and has somewhere to run — the
   * `release-readiness` workflow — so "we'll verify it by hand" cannot quietly
   * become nobody's job.
   */
  it('has a release-time check that the pages actually resolve', () => {
    const check = read('scripts/check-legal.mjs');

    // Reads the links from the screen rather than from a list of its own, so a
    // URL changed in one place and forgotten in the other cannot pass.
    expect(check).toContain('src/app/settings/about.tsx');
    expect(check).toContain('SUPPORT_EMAIL');
    expect(read('package.json')).toContain('check:legal');
    expect(read('.github/workflows/release-readiness.yml')).toContain('check-legal.mjs');
  });

  it('is not wired into the pull-request gate, where it would be flaky', () => {
    expect(read('.github/workflows/ci.yml')).not.toContain('check:legal');
  });
});

/**
 * The splash has to come down on every path out of startup.
 *
 * `SplashScreen.hideAsync()` was reachable from one component, four providers
 * deep, and four `return`s sat above it. The first APK took the
 * misconfiguration branch and stayed on the logo forever — and the screen
 * written to explain the problem was rendering behind a splash nobody had told
 * to go away.
 *
 * Static, because the failure only appears in a release build on a device: the
 * one place a unit test does not run.
 */
describe('startup can never end on the splash', () => {
  const layout = read('src/app/_layout.tsx');

  it('has a watchdog that hides it regardless of what rendered', () => {
    expect(layout).toContain('SPLASH_WATCHDOG_MS');
    expect(layout).toMatch(/setTimeout\(\s*hideSplash/);
  });

  it('hides it when the build reports itself misconfigured', () => {
    // Otherwise the diagnosis is invisible, which is how this shipped.
    expect(layout).toMatch(/if \(misconfigured\) hideSplash\(\)/);
  });

  it('does not wait forever on a font that failed to load', () => {
    // The error used to be discarded, so a bad face hung the app for the life
    // of the process. Persian falls back to the system face.
    expect(layout).toContain('fontError');
    expect(layout).toContain('fontsSettled');
  });

  it('keeps a single owner for hiding it', () => {
    // One helper, so a new early return cannot forget to call it.
    expect(layout).toContain('const hideSplash =');
  });
});
