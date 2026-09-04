/**
 * Dananeh / دانانه design tokens.
 *
 * Source of truth for every colour, size and duration in the app. Components
 * reference semantic names — never a hex. The same values are mirrored as CSS
 * custom properties in `global.css` so NativeWind classes (`bg-canvas`,
 * `text-ink`, …) resolve to the same palette; change one, change both.
 *
 * Ratios in the comments are measured WCAG 2.x values against the stated
 * background, from the handoff. Four palette corrections are load-bearing:
 *   1. sprout is decorative in light mode — light progress fills use `brand`.
 *   2. sun is fill-only in light mode — as type it becomes `sunInk`.
 *   3. dark-mode primary buttons take an ink label (`onBrand`), not white.
 *   4. tokens are measured on their real parent, not on canvas — hence
 *      `errorInk` (text on the error tint) and `borderStrong`.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    /** page background */
    canvas: '#F7F4EA',
    /** cards, sheets */
    card: '#FFFDF7',
    /** body, titles — 14.4:1 on canvas */
    textPrimary: '#1F241E',
    /** metadata, captions — 5.4:1 on canvas */
    textSecondary: '#5D665B',
    /** CTA fill, progress fill, links — 5.6:1 on canvas */
    brand: '#2F6D4B',
    /** label on a brand fill — 5.6:1 */
    onBrand: '#FFFDF7',
    /** decorative only in light mode — 2.6:1 */
    sprout: '#65A96B',
    /** fill only in light mode — 1.9:1; ink label on top is 7.7:1 */
    sun: '#E9A928',
    /** sun as type — 5.0:1 on canvas */
    sunInk: '#8A6100',
    /** humanities topic family — 6.1:1 */
    plum: '#6F5178',
    /** incorrect, destructive — 5.0:1 on canvas */
    error: '#B5443C',
    /** error text on its own tint — 5.7:1 */
    errorInk: '#A03A33',
    /** card borders, dividers */
    hairline: 'rgba(31,36,30,0.10)',
    /** off switches, state illustrations — 3.3:1 */
    borderStrong: '#8C8778',
    /** progress tracks — brand fill is 4.7:1 against it */
    track: '#E4E0D2',
    /** sheet scrim, 32% */
    scrim: 'rgba(31,36,30,0.32)',
    brandTint: 'rgba(47,109,75,0.10)',
    sproutTint: 'rgba(101,169,107,0.12)',
    sunTint: 'rgba(233,169,40,0.16)',
    plumTint: 'rgba(111,81,120,0.10)',
    errorTint: 'rgba(181,68,60,0.09)',
  },
  dark: {
    canvas: '#171A17',
    card: '#222722',
    /** 15.8:1 */
    textPrimary: '#F4F3EB',
    /** 9.6:1 */
    textSecondary: '#BBC2B8',
    /** 7.6:1 */
    brand: '#77B98A',
    /** ink label on a brand fill — 8.2:1. White would be 2.1:1. */
    onBrand: '#0F120F',
    /** progress fill is safe in dark — 9.3:1 */
    sprout: '#8BCB94',
    /** usable as type in dark — 10.7:1 */
    sun: '#F2C45F',
    /** aliases sun in dark */
    sunInk: '#F2C45F',
    /** 7.1:1 */
    plum: '#B99BC2',
    /** 7.3:1 */
    error: '#EF8C84',
    errorInk: '#EF8C84',
    hairline: 'rgba(244,243,235,0.09)',
    borderStrong: '#4A5248',
    track: '#333A32',
    scrim: 'rgba(0,0,0,0.48)',
    brandTint: 'rgba(119,185,138,0.14)',
    sproutTint: 'rgba(139,203,148,0.14)',
    sunTint: 'rgba(242,196,95,0.14)',
    plumTint: 'rgba(185,155,194,0.14)',
    errorTint: 'rgba(239,140,132,0.14)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Six weights ship in the repo; four are used. The scale has no light weight
 *  on purpose — Persian loses stroke contrast at body sizes. */
export const FontFamily = {
  regular: 'YekanBakh-Regular',
  semibold: 'YekanBakh-SemiBold',
  bold: 'YekanBakh-Bold',
  extrabold: 'YekanBakh-ExtraBold',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.regular,
    /** iOS `UIFontDescriptorSystemDesignMonospaced` — LTR-isolated technical strings only */
    mono: 'ui-monospace',
  },
  android: {
    sans: FontFamily.regular,
    mono: 'monospace',
  },
  default: {
    sans: FontFamily.regular,
    mono: 'monospace',
  },
  web: {
    sans: FontFamily.regular,
    mono: 'ui-monospace, Menlo, monospace',
  },
})!;

/**
 * Type scale. Line height is never below 1.65× at body sizes: Persian
 * descenders and dots collide below that.
 */
export const Typography = {
  display: { fontFamily: FontFamily.extrabold, fontSize: 34, lineHeight: 44 },
  titleLg: { fontFamily: FontFamily.extrabold, fontSize: 26, lineHeight: 38 },
  titleMd: { fontFamily: FontFamily.bold, fontSize: 20, lineHeight: 32 },
  body: { fontFamily: FontFamily.regular, fontSize: 17, lineHeight: 30 },
  bodySm: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 26 },
  label: { fontFamily: FontFamily.bold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FontFamily.semibold, fontSize: 13, lineHeight: 22 },
} as const;

export type TextVariant = keyof typeof Typography;

/** 200% Dynamic Type: body scales fully, titles cap at 1.6× and clamp to 3 lines. */
export const TitleMaxScale = 1.6;
export const TitleClampLines = 3;

/** 4pt base. */
export const Spacing = {
  half: 2,
  /** 1 — hairline gaps */
  one: 4,
  /** 2 — chip padding */
  two: 8,
  /** 3 — in-card stack */
  three: 12,
  /** 4 — card padding */
  four: 16,
  /** 5 — screen gutter */
  five: 20,
  /** 6 — block rhythm, strict inside the player */
  six: 24,
  /** 8 — section break */
  eight: 32,
  /** 12 — rail break */
  twelve: 48,
} as const;

export const Radius = {
  /** chip, badge */
  chip: 8,
  /** input, answer option */
  input: 16,
  /** card, button — no pill buttons anywhere */
  card: 24,
  /** sheet, hero */
  sheet: 32,
} as const;

/**
 * Three levels only. Cards are e0: separation comes from the canvas/card value
 * step, not from shadow. Dark mode replaces shadow with the lighter surface.
 */
export const Elevation = {
  e0: {},
  e1: {
    shadowColor: '#1F241E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  /** sheets and the offline banner only */
  e2: {
    shadowColor: '#1F241E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 8,
  },
} as const;

/** Motion explains a state change or it does not exist. Nothing loops, no confetti. */
export const Motion = {
  duration: {
    blockChange: 200,
    answerFeedback: 180,
    growth: 700,
    sheet: 260,
    skeletonSwap: 160,
    tabChange: 0,
  },
  reducedDuration: {
    blockChange: 120,
    answerFeedback: 0,
    growth: 150,
    sheet: 140,
    skeletonSwap: 0,
    tabChange: 0,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    /** standard with a 120ms hold */
    emphasised: [0.2, 0, 0, 1],
  },
  emphasisedHold: 120,
  /** direct-manipulation drag only (ordering, matchPairs) */
  spring: { damping: 0.8, stiffness: 220 },
} as const;

export const Breakpoints = {
  /** SE: gutter 20, hero title clamps to 2 lines */
  se: 320,
  /** baseline — all specs are drawn here */
  base: 375,
  /** gutter 24, card metadata on one row */
  wide: 430,
  /** web/tablet: content maxes at 720, rails become a 2-col grid */
  tablet: 600,
} as const;

export const Gutter = { compact: 20, wide: 24 } as const;

/** Everywhere, including inline text actions. */
export const MinTouchTarget = 44;

/** Six topics, three accent families. Six hues would collide with
 *  correct/incorrect/offline semantics. */
export const TopicFamily = {
  sciences: 'brand',
  humanities: 'plum',
  practical: 'sun',
} as const;

export type TopicFamilyName = keyof typeof TopicFamily;

/** Tab bar is 76pt border-box plus the home-indicator inset. */
export const BottomTabInset = Platform.select({ ios: 76, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
