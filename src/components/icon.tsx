import React from 'react';
import { I18nManager, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { ThemeColor } from '@/constants/theme';

interface GlyphProps {
  color: string;
  stroke: {
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: 'none';
  };
}

/**
 * The icon set: one 24×24 grid, stroke 1.75, round caps, no fills except state
 * indicators. Glyphs derive from the concentric-ring brand geometry and are
 * lifted from the design handoff.
 */
const glyphs = {
  close: (p: GlyphProps) => <Path d="M6 6l12 12M18 6L6 18" {...p.stroke} />,
  check: (p: GlyphProps) => <Path d="M5 13l4 4L19 7" {...p.stroke} />,
  chevronForward: (p: GlyphProps) => <Path d="M9 5l7 7-7 7" {...p.stroke} />,
  chevronBack: (p: GlyphProps) => <Path d="M15 5l-7 7 7 7" {...p.stroke} />,
  chevronUp: (p: GlyphProps) => <Path d="M5 15l7-7 7 7" {...p.stroke} />,
  chevronDown: (p: GlyphProps) => <Path d="M5 9l7 7 7-7" {...p.stroke} />,
  search: (p: GlyphProps) => (
    <>
      <Circle cx={11} cy={11} r={7} {...p.stroke} />
      <Path d="M16 16l4 4" {...p.stroke} />
    </>
  ),
  home: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={12} r={10} {...p.stroke} />
      <Circle cx={12} cy={12} r={3.6} fill={p.color} />
    </>
  ),
  homeOutline: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={12} r={10} {...p.stroke} />
      <Circle cx={12} cy={12} r={3.6} {...p.stroke} />
    </>
  ),
  garden: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={12} r={9.5} {...p.stroke} />
      <Circle cx={12} cy={12} r={5.5} {...p.stroke} />
    </>
  ),
  person: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={8.5} r={4} {...p.stroke} />
      <Path d="M4.5 20c1.6-4 4.2-6 7.5-6s5.9 2 7.5 6" {...p.stroke} />
    </>
  ),
  bookmark: (p: GlyphProps) => <Path d="M6 4h12v16l-6-4-6 4z" {...p.stroke} />,
  more: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={5.5} r={1.7} fill={p.color} />
      <Circle cx={12} cy={12} r={1.7} fill={p.color} />
      <Circle cx={12} cy={18.5} r={1.7} fill={p.color} />
    </>
  ),
  sources: (p: GlyphProps) => <Path d="M4 6h16M4 12h16M4 18h10" {...p.stroke} />,
  download: (p: GlyphProps) => (
    <>
      <Path d="M12 3v12m0 0l-4-4m4 4l4-4" {...p.stroke} />
      <Path d="M4 19h16" {...p.stroke} />
    </>
  ),
  play: (p: GlyphProps) => <Path d="M8 5l11 7-11 7z" {...p.stroke} />,
  clock: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={12} r={9} {...p.stroke} />
      <Path d="M12 7v5l3 2" {...p.stroke} />
    </>
  ),
  info: (p: GlyphProps) => (
    <>
      <Circle cx={12} cy={12} r={9} {...p.stroke} />
      <Path d="M12 8v.01M12 11v5" {...p.stroke} />
    </>
  ),
  alert: (p: GlyphProps) => (
    <>
      <Path d="M12 3l9 16H3z" {...p.stroke} />
      <Path d="M12 9v4M12 16v.01" {...p.stroke} />
    </>
  ),
  lock: (p: GlyphProps) => (
    <>
      <Rect x={4} y={10} width={16} height={10} rx={2} {...p.stroke} />
      <Path d="M8 10V7a4 4 0 018 0v3" {...p.stroke} />
    </>
  ),
  minus: (p: GlyphProps) => <Path d="M6 12h12" {...p.stroke} />,
};

export type IconName = keyof typeof glyphs;

/** Direction carries meaning for these. Play, check, download, clock, bookmark
 *  and the brand mark must never mirror. */
const mirrored = new Set<IconName>(['chevronForward', 'chevronBack']);

export interface IconProps {
  name: IconName;
  size?: number;
  /** A theme token name, or a literal colour the parent already resolved. */
  color?: ThemeColor | string;
}

export function Icon({ name, size = 24, color = 'textPrimary' }: IconProps) {
  const theme = useTheme();
  const resolved = color in theme ? theme[color as ThemeColor] : (color as string);
  const glyph = glyphs[name]({
    color: resolved,
    stroke: {
      stroke: resolved,
      strokeWidth: 1.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'none',
    },
  });

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={[
        // react-native-web shrinks views by default; a fixed-size glyph must not.
        { flexShrink: 0 },
        mirrored.has(name) && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null,
      ]}>
      {glyph}
    </Svg>
  );
}

/**
 * The brand mark: three concentric circles plus a filled centre. Never
 * mirrored, recoloured or rotated; works down to 24px. Drawn with views so it
 * needs no transform to stay upright in an RTL tree.
 */
export function BrandMark({ size = 88 }: { size?: number }) {
  const theme = useTheme();
  const ring = (scale: number, borderWidth: number, color: string, opacity: number) => (
    <View
      key={scale}
      style={{
        position: 'absolute',
        width: size * scale,
        height: size * scale,
        borderRadius: (size * scale) / 2,
        borderWidth,
        borderColor: color,
        opacity,
      }}
    />
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {ring(0.955, Math.max(1, size / 58), theme.brand, 0.3)}
      {ring(0.682, Math.max(1, size / 58), theme.brand, 0.55)}
      {ring(0.409, Math.max(1.25, size / 44), theme.sprout, 1)}
      <View
        style={{
          width: size * 0.159,
          height: size * 0.159,
          borderRadius: size * 0.08,
          backgroundColor: theme.brand,
        }}
      />
    </View>
  );
}
