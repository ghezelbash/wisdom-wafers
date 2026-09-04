import React from 'react';
import { ActivityIndicator, Pressable, PressableProps } from 'react-native';

import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** `lg` matches the primary CTA's height — use it where a quieter variant
   *  has to read as an equally weighted choice, such as «الان نه». */
  size?: 'lg' | 'md';
  className?: string;
}

/**
 * The app's button. Radius 24 everywhere — no pill buttons; full-round CTAs
 * read as consumer-app and fight the editorial tone.
 *
 * Height is 56 for primary and 48 for the quieter variants, both already above
 * the 44pt floor, and the label never shrinks: at large text sizes the button
 * grows instead.
 */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  size,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const theme = useTheme();

  const surface =
    variant === 'primary'
      ? 'bg-brand'
      : variant === 'secondary'
        ? 'bg-card border border-hairline'
        : variant === 'destructive'
          ? 'bg-error-tint border border-error'
          : '';

  const labelColor =
    variant === 'primary'
      ? 'onBrand'
      : variant === 'destructive'
        ? 'error'
        : variant === 'ghost'
          ? 'secondary'
          : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      disabled={disabled || loading}
      className={`items-center justify-center rounded-card px-6 ${surface} ${className}`}
      style={({ pressed }) => ({
        minHeight: (size ?? (variant === 'primary' ? 'lg' : 'md')) === 'lg' ? 56 : MinTouchTarget + 4,
        opacity: pressed ? 0.85 : disabled ? 0.55 : 1,
      })}
      {...props}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.onBrand : theme.brand} />
      ) : (
        <Text
          variant={(size ?? (variant === 'primary' ? 'lg' : 'md')) === 'lg' ? 'body' : 'bodySm'}
          weight="bold"
          color={labelColor}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
