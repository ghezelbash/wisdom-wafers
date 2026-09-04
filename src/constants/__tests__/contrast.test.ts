import { Colors, MinTouchTarget, Typography } from '@/constants/theme';

/**
 * The ratios in the token comments, computed rather than trusted.
 *
 * `theme.ts` states a measured contrast ratio beside almost every colour, and
 * four of the palette decisions are load-bearing because of them — sprout is
 * decorative in light mode, sun is fill-only in light mode, a dark primary
 * button takes an ink label, and `errorInk` exists because error text sits on
 * the error tint rather than on canvas.
 *
 * Nothing checked any of it. A colour could be nudged and the comment would
 * still claim the old number, which is worse than no comment: it is a wrong
 * answer to a question somebody stopped asking.
 */

const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const parsed = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) =>
    parseInt(parsed.slice(offset, offset + 2), 16)
  );
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, rounded the way the comments are written. */
export function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 10) / 10;
}

describe('light mode', () => {
  const light = Colors.light;

  it.each([
    ['body text on canvas', light.textPrimary, light.canvas, 14.4],
    ['secondary text on canvas', light.textSecondary, light.canvas, 5.4],
    ['brand as a link on canvas', light.brand, light.canvas, 5.6],
    ['a label on a brand fill', light.onBrand, light.brand, 6.1],
    ['sun as type, which is why sunInk exists', light.sunInk, light.canvas, 5.0],
    ['the humanities family colour', light.plum, light.canvas, 6.1],
    ['error on canvas', light.error, light.canvas, 4.9],
  ])('%s measures what the token says', (_what, foreground, background, claimed) => {
    expect(contrast(foreground, background)).toBeCloseTo(claimed, 1);
  });

  it('meets AA for every colour used as body text', () => {
    for (const colour of [light.textPrimary, light.textSecondary, light.brand, light.sunInk]) {
      expect(contrast(colour, light.canvas)).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * The two corrections that are easiest to undo by accident. Both of these
   * *failing* would mean someone had made sprout or sun usable as type in light
   * mode, which they are not.
   */
  it('keeps sprout decorative and sun fill-only', () => {
    expect(contrast(light.sprout, light.canvas)).toBeLessThan(4.5);
    expect(contrast(light.sun, light.canvas)).toBeLessThan(4.5);
  });

  it('keeps an ink label legible on a sun fill', () => {
    expect(contrast(light.textPrimary, light.sun)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a brand progress fill visible against its track', () => {
    expect(contrast(light.brand, light.track)).toBeGreaterThanOrEqual(3);
  });
});

describe('dark mode', () => {
  const dark = Colors.dark;

  it.each([
    ['body text', dark.textPrimary, dark.canvas, 15.8],
    ['secondary text', dark.textSecondary, dark.canvas, 9.6],
    ['brand', dark.brand, dark.canvas, 7.6],
    ['sprout, which is safe as a fill here', dark.sprout, dark.canvas, 9.2],
    ['sun, which is usable as type here', dark.sun, dark.canvas, 10.7],
    ['plum', dark.plum, dark.canvas, 7.1],
    ['error', dark.error, dark.canvas, 7.3],
  ])('%s measures what the token says', (_what, foreground, background, claimed) => {
    expect(contrast(foreground, background)).toBeCloseTo(claimed, 1);
  });

  /**
   * The correction the comment spells out: white on the dark brand is 2.1:1,
   * which is unreadable. The button takes an ink label instead.
   */
  it('takes an ink label on a primary button, never white', () => {
    expect(contrast(dark.onBrand, dark.brand)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', dark.brand)).toBeLessThan(3);
  });
});

describe('touch targets and type', () => {
  it('never offers a target smaller than 44', () => {
    expect(MinTouchTarget).toBeGreaterThanOrEqual(44);
  });

  /**
   * Persian needs the leading. Below about 1.65 the descenders and the dots
   * collide with the line beneath, which is a legibility failure rather than a
   * style preference.
   */
  it.each(['body', 'bodySm', 'caption'] as const)(
    'sets %s at a line height of at least 1.65',
    (variant) => {
      const style = Typography[variant];
      expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.65);
    }
  );

  /** Titles and labels are tighter on purpose — they are not running text. */
  it.each(['display', 'titleLg', 'titleMd', 'label'] as const)(
    'keeps %s readable without prose leading',
    (variant) => {
      const style = Typography[variant];
      expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.2);
    }
  );
});
