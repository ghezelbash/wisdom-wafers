import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No other company's brand ships in this app.
 *
 * The starter left an Expo logo, an Expo badge, two React logos and a glow
 * behind — and one of them was on screen: `AnimatedSplashOverlay` drew a
 * full-screen Expo logo on Expo blue (`#208AEF`) after the native Dananeh
 * splash, on every cold start.
 *
 * These are static because that is the only kind of check that catches an asset
 * being re-added by a template update or a merge.
 */

const ROOT = join(__dirname, '../..');

const SOURCE_DIRS = ['src', 'assets', 'admin/src'];
const SKIP = new Set(['node_modules', '.expo', 'dist', 'android', 'ios', 'build']);

function walk(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;

  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full.slice(ROOT.length + 1));
  }
  return found;
}

const files = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const sources = files.filter((path) => /\.(ts|tsx|json|css|js)$/.test(path));

describe('the starter assets', () => {
  it.each([
    'expo-logo',
    'expo-badge',
    'react-logo',
    'logo-glow',
    'tutorial-web',
    'partial-react-logo',
  ])('no file named %s remains', (name) => {
    expect(files.filter((path) => path.includes(name))).toEqual([]);
  });

  it('leaves no directory of starter images at all', () => {
    expect(existsSync(join(ROOT, 'assets/images'))).toBe(false);
    expect(existsSync(join(ROOT, 'assets/expo.icon'))).toBe(false);
  });

  it('is referenced from nowhere in the source', () => {
    const offenders = sources.filter((path) =>
      /assets\/images|expo-logo|expo-badge|react-logo|logo-glow/.test(text(path))
    );

    expect(offenders).toEqual([]);
  });

  /** The colour the second splash was painted in. It appears nowhere now. */
  it('leaves no Expo blue in any source file', () => {
    const offenders = sources.filter((path) => /#208AEF|#3C9FFE|#0274DF/i.test(text(path)));
    expect(offenders).toEqual([]);
  });
});

describe('the brand assets the build points at', () => {
  const config = text('app.config.ts');

  it.each([
    ['launcher icon', 'assets/brand/app-icon-1024.png'],
    ['adaptive foreground', 'assets/brand/android-adaptive-foreground.png'],
    ['monochrome icon', 'assets/brand/android-adaptive-monochrome.png'],
    ['notification icon', 'assets/brand/notification-icon.png'],
    ['light splash', 'assets/brand/splash-icon.png'],
    ['dark splash', 'assets/brand/splash-icon-dark.png'],
    ['web favicon', 'assets/brand/favicon.png'],
  ])('names a real file for the %s', (_role, path) => {
    expect(config).toContain(path);
    expect(existsSync(join(ROOT, path))).toBe(true);
  });

  /**
   * The overlay that hides the native splash has to be painted in the *same*
   * colours the native splash uses, or the hand-off is a second splash — which
   * is precisely what the Expo starter's version was.
   */
  it('paints the overlay in the same colours as the native splash', () => {
    const overlay = text('src/components/brand-splash.tsx');

    for (const colour of ['#F7F4EA', '#171A17']) {
      expect(config).toContain(colour);
      expect(overlay).toContain(colour);
    }

    expect(config).toContain('imageWidth: 124');
    expect(overlay).toContain('SPLASH_IMAGE_WIDTH = 124');
  });

  it('shows the Dananeh mark in the overlay, not a logo from a template', () => {
    const overlay = text('src/components/brand-splash.tsx');

    expect(overlay).toContain('assets/brand/splash-icon.png');
    expect(overlay).toContain('assets/brand/splash-icon-dark.png');
  });
});

describe('launch content', () => {
  const seedFiles = walk(join(ROOT, 'src/data/seeds')).filter((path) => path.endsWith('.ts'));

  /**
   * An image block with no picture and no declared intent rendered an empty
   * grey frame with the alt text in it — indistinguishable from an asset that
   * failed to load.
   */
  it('ships no image block that is neither pictured nor described', () => {
    for (const path of seedFiles) {
      const source = text(path);
      const blocks = source.split(/type: 'image'/).slice(1);

      for (const block of blocks) {
        const body = block.split(/\n {4}\},/)[0];
        expect(body.includes('imageUrl') || body.includes('describedOnly: true')).toBe(true);
      }
    }
  });
});
