import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

import { Colors, FontFamily, Fonts, TextVariant, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Every colour a text run is allowed to take. Colour is a prop, not a
 * className: the variant styles land in `style`, which outranks NativeWind's
 * class output, so a `text-…` class would silently lose.
 */
export type TextColor =
  | 'primary'
  | 'secondary'
  | 'brand'
  | 'onBrand'
  | 'sun'
  | 'plum'
  | 'error'
  | 'inherit';

const colorToken: Record<Exclude<TextColor, 'inherit'>, keyof typeof Colors.light> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  brand: 'brand',
  onBrand: 'onBrand',
  // sun and error are fill-only in light mode; as type they take their ink pair.
  sun: 'sunInk',
  plum: 'plum',
  error: 'errorInk',
};

const weightToFamily = {
  regular: FontFamily.regular,
  semibold: FontFamily.semibold,
  bold: FontFamily.bold,
  extrabold: FontFamily.extrabold,
} as const;

type Weight = keyof typeof weightToFamily;

const weightToNumeric: Record<Weight, TextStyle['fontWeight']> = {
  regular: '400',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

const familyToWeight: Record<string, Weight> = {
  [FontFamily.regular]: 'regular',
  [FontFamily.semibold]: 'semibold',
  [FontFamily.bold]: 'bold',
  [FontFamily.extrabold]: 'extrabold',
};

export interface TextProps extends RNTextProps {
  className?: string;
  /** Type scale step. Sizes come from here, never from ad-hoc classes. */
  variant?: TextVariant;
  /** Overrides the variant's weight when a run needs emphasis. */
  weight?: Weight;
  color?: TextColor;
  /**
   * Bidi isolation for a Latin run — emails, URLs, error codes, versions,
   * publisher names, formulas, and Latin titles (whose trailing "?" otherwise
   * renders at the wrong end).
   */
  ltr?: boolean;
  /** Monospace slot for technical identifiers. Implies `ltr`. */
  mono?: boolean;
}

/**
 * The app's only text primitive.
 *
 * Persian typesetting rules it enforces: line height never drops below 1.65×
 * at body sizes, no underlines (links use weight + colour), and Latin runs are
 * isolated rather than left to reflow inside an RTL paragraph.
 */
export function Text({
  className,
  style,
  variant = 'body',
  weight,
  color = 'primary',
  ltr = false,
  mono = false,
  ...props
}: TextProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const isolated = ltr || mono;

  // Yekan Bakh FaNum renders Latin digits as Persian glyphs, which is right for
  // Persian and wrong for the English port — so the stack falls back to the
  // system face outside `fa`, keeping weight via a numeric value.
  const persianFace = i18n.language.startsWith('fa');
  const family = weight ? weightToFamily[weight] : Typography[variant].fontFamily;

  const variantStyle: TextStyle = {
    ...Typography[variant],
    ...(weight ? { fontFamily: weightToFamily[weight] } : null),
    ...(persianFace
      ? null
      : { fontFamily: undefined, fontWeight: weightToNumeric[familyToWeight[family] ?? 'regular'] }),
    ...(mono ? { fontFamily: Fonts.mono } : null),
    // Only pinned for an isolated Latin run. Left unset otherwise so
    // `text-center` and friends still reach the element — this style object
    // outranks anything className produces.
    ...(isolated ? ({ writingDirection: 'ltr', textAlign: 'left' } as const) : null),
  };

  if (color !== 'inherit') {
    variantStyle.color = theme[colorToken[color]];
  }

  return <RNText className={className} style={[variantStyle, style]} {...props} />;
}
