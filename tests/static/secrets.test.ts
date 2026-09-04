import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nothing secret is in the repository.
 *
 * Credentials leak by being committed once, briefly, and noticed later — by
 * which point the history has them forever. This checks what git is actually
 * tracking rather than what `.gitignore` claims, because a file added before a
 * rule was written stays tracked despite it.
 */

const ROOT = join(__dirname, '..', '..');

const tracked = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

/**
 * The one `.env*` file that belongs in the repository.
 *
 * It carries key *names* and no values, which is the whole point of it — and
 * the test below asserts that rather than taking it on trust.
 */
const ENV_EXAMPLE = '.env.example';

/** Filenames that are credentials by convention, whatever they contain. */
const SECRET_FILENAMES = [
  /(^|\/)\.env(?!\.example$)($|\.)/,
  /(^|\/)google-services\.json$/,
  /(^|\/)GoogleService-Info\.plist$/,
  /(^|\/)service[-_]?account.*\.json$/i,
  /\.(p8|p12|pem|jks|keystore)$/,
  /(^|\/)api[-_]?key/i,
];

/**
 * Values that are secret wherever they appear.
 *
 * Deliberately not "anything that looks like a token": a pattern loose enough
 * to catch everything catches enough noise that the test gets muted, which is
 * worse than not having it.
 */
const SECRET_CONTENT: { name: string; pattern: RegExp }[] = [
  { name: 'a private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'a service-account private key field', pattern: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: 'a Firebase service-account block', pattern: /"type"\s*:\s*"service_account"/ },
  { name: 'an Expo access token', pattern: /\b[A-Za-z0-9_-]*EXPO_TOKEN\s*[:=]\s*["'][^"'$]{8,}/ },
];

/** Text files worth reading. Binaries and lockfiles are noise here. */
const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|sh|rules|env|plist|xml|gradle)$/;
const SKIP = /^(package-lock\.json|.*\/package-lock\.json|design_handoff_dananeh\/)/;

describe('the repository holds no credentials', () => {
  const files = tracked();

  it('is reading a real file list', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('package.json');
  });

  it('tracks no file that is a credential by name', () => {
    const offenders = files.filter((file) =>
      SECRET_FILENAMES.some((pattern) => pattern.test(file))
    );
    expect(offenders).toEqual([]);
  });

  it.each(SECRET_CONTENT)('contains no $name', ({ pattern }) => {
    const offenders: string[] = [];

    for (const file of files) {
      if (!SCANNABLE.test(file) || SKIP.test(file)) continue;
      // A tracked file can be missing from the working tree mid-rebase; that is
      // not something this test should fail on.
      let content: string;
      try {
        content = readFileSync(join(ROOT, file), 'utf8');
      } catch {
        continue;
      }
      // This file names the patterns it looks for, and would otherwise match
      // itself.
      if (file.endsWith('tests/static/secrets.test.ts')) continue;
      if (pattern.test(content)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('ignores the local environment file rather than tracking it', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\.env\s*$/m);
    expect(files).not.toContain('.env');
  });

  /**
   * The example is committed on purpose, so it is the one file most likely to
   * end up with somebody's real values pasted into it.
   */
  it('keeps the committed example free of values', () => {
    expect(files).toContain(ENV_EXAMPLE);
    const example = readFileSync(join(ROOT, ENV_EXAMPLE), 'utf8');

    for (const line of example.split('\n')) {
      if (line.trim().startsWith('#') || !line.includes('=')) continue;
      const value = line.slice(line.indexOf('=') + 1).trim();

      // A name with nothing after it, or an obviously non-secret default.
      expect(value).toMatch(/^(|mock|remote|development|staging|production|0|1)$/);
    }
  });

  /**
   * Firebase's web config is not a secret — the API key identifies the project
   * and is enforced by rules and App Check, not by being hidden. It still must
   * not be hard-coded, so a build cannot silently point at the wrong project.
   */
  it('reads Firebase configuration from the environment, never from a literal', () => {
    const source = readFileSync(join(ROOT, 'src/data/remote/firebase-app.ts'), 'utf8');
    const config = source.slice(source.indexOf('const config = {'), source.indexOf('};'));

    for (const line of config.split('\n').slice(1)) {
      if (!line.includes(':')) continue;
      expect(line).toContain('process.env.');
    }
  });
});
