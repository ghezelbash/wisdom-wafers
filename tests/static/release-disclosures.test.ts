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
   * This fails until the pages are actually published, and that is deliberate:
   * a link to a 404 is worse than no link, because it looks answered.
   *
   * Flip `PUBLISHED` when `docs/release/` records that both pages are live.
   */
  it.todo('resolve to a published page — verified by hand before the first external build');
});
