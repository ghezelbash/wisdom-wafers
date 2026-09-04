import React from 'react';
import { I18nManager, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Text } from '@/components/Text';
import { useTheme } from '@/hooks/use-theme';

/**
 * A progress ring.
 *
 * SVG does not inherit document direction, so the RTL flip is an explicit
 * transform: the arc has to fill from the same edge as every other progress
 * indicator in the app. Only a ring carrying data gets an accessible label;
 * decorative rings are hidden from the reader.
 */
export function ProgressRing({
  progress,
  size = 46,
  strokeWidth = 4,
  label,
  accessibilityLabel,
}: {
  /** 0–1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Centre text, already formatted and localised. */
  label?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G
          // Start at the top, and run towards the start edge of the layout.
          transform={
            I18nManager.isRTL
              ? `rotate(-90 ${size / 2} ${size / 2}) scale(-1 1) translate(${-size} 0)`
              : `rotate(-90 ${size / 2} ${size / 2})`
          }>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            // Light-mode fills use brand: sprout measures 1.88:1 on the track.
            stroke={theme.brand}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
          />
        </G>
      </Svg>
      {label ? (
        <Text variant="caption" weight="bold" style={{ fontSize: size < 40 ? 10 : 12 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
