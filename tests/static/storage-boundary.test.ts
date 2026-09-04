import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The storage boundary, asserted rather than agreed.
 *
 * Screens, components and player blocks read through repositories — progress,
 * the catalogue, the outbox — and must not know whether the device is using
 * SQLite, a key-value store or files. The rule survived one refactor by
 * convention and broke in another, so it is a test now.
 *
 * It lives here rather than beside the code because it reads the source tree
 * from disk, which needs Node — the app's own suite runs under jest-expo.
 */

const ROOT = join(__dirname, '..', '..', 'src');

/** Modules that are allowed to name a storage implementation. */
const DATA_LAYER = ['data/local', 'data/remote', 'lib/progress-store.ts', 'lib/outbox.ts'];

const FORBIDDEN = [
  { pattern: /@react-native-async-storage\/async-storage/, name: 'AsyncStorage' },
  { pattern: /from ['"]expo-sqlite['"]/, name: 'expo-sqlite' },
  { pattern: /from ['"]expo-file-system['"]/, name: 'expo-file-system' },
  { pattern: /@\/data\/local\//, name: 'the local store' },
];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    if (entry === '__tests__' || entry === '__mocks__') continue;
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }

  return found;
}

describe('the UI does not know how anything is stored', () => {
  const files = ['app', 'components', 'features', 'hooks'].flatMap((directory) =>
    sourceFiles(join(ROOT, directory))
  );

  it('finds the source files it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(FORBIDDEN)('never reaches for $name', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(ROOT.length + 1))).toEqual([]);
  });
});

describe('progress and the queue keep their implementations to themselves', () => {
  it('exposes no driver, connection or table name from the repositories', () => {
    for (const module of ['lib/progress-store.ts', 'lib/outbox.ts']) {
      const source = readFileSync(join(ROOT, module), 'utf8');
      const exported = source.match(/^export (?:async )?function (\w+)/gm) ?? [];

      expect(exported.join(' ')).not.toMatch(/driver|sqlite|asyncStorage/i);
    }
  });

  it('keeps the data layer where it belongs', () => {
    // A sanity check on the allow-list above: these modules exist and are the
    // only ones the boundary test exempts.
    for (const module of DATA_LAYER) {
      expect(() => statSync(join(ROOT, module))).not.toThrow();
    }
  });
});
