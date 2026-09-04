/** @type {import('tailwindcss').Config} */

// Dananeh design tokens. Colours resolve through the CSS custom properties
// defined in `global.css`, which swap on `prefers-color-scheme` — so a token
// class such as `bg-canvas` is already theme-aware and needs no `dark:` pair.
// `src/constants/theme.ts` holds the same values for JS-side consumers.
module.exports = {
  // Every source file, not just app/ and components/ — a class used only in
  // src/features would otherwise never be generated.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ['YekanBakh-Regular', 'sans-serif'],
        'y-regular': ['YekanBakh-Regular', 'sans-serif'],
        'y-semibold': ['YekanBakh-SemiBold', 'sans-serif'],
        'y-bold': ['YekanBakh-Bold', 'sans-serif'],
        'y-extrabold': ['YekanBakh-ExtraBold', 'sans-serif'],
      },
      colors: {
        canvas: 'var(--color-canvas)',
        card: 'var(--color-card)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        brand: {
          DEFAULT: 'var(--color-brand)',
          on: 'var(--color-on-brand)',
          tint: 'var(--color-brand-tint)',
        },
        sprout: {
          DEFAULT: 'var(--color-sprout)',
          tint: 'var(--color-sprout-tint)',
        },
        sun: {
          DEFAULT: 'var(--color-sun)',
          ink: 'var(--color-sun-ink)',
          tint: 'var(--color-sun-tint)',
        },
        plum: {
          DEFAULT: 'var(--color-plum)',
          tint: 'var(--color-plum-tint)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          ink: 'var(--color-error-ink)',
          tint: 'var(--color-error-tint)',
        },
        hairline: 'var(--color-hairline)',
        strong: 'var(--color-strong)',
        track: 'var(--color-track)',
        scrim: 'var(--color-scrim)',
      },
      borderRadius: {
        // 8 chip/badge · 16 input/option · 24 card/button · 32 sheet/hero.
        // No pill buttons — full-round CTAs fight the editorial tone.
        chip: '8px',
        input: '16px',
        card: '24px',
        sheet: '32px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        12: '48px',
        touch: '44px',
      },
      fontSize: {
        display: ['34px', '44px'],
        'title-lg': ['26px', '38px'],
        'title-md': ['20px', '32px'],
        body: ['17px', '30px'],
        'body-sm': ['15px', '26px'],
        label: ['14px', '20px'],
        caption: ['13px', '22px'],
      },
      maxWidth: {
        content: '720px',
      },
    },
  },
  plugins: [],
}
