import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { useTheme } from '@/hooks/use-theme';

/**
 * One answer option.
 *
 * After submitting, every state carries three signals — indicator shape,
 * border treatment and a text badge — before colour is considered. `missed`
 * takes a dashed border so hit / missed / wrong stay distinguishable to a
 * reader who sees no colour at all. Wrong options are never hidden, only
 * de-emphasised: the reader needs to see what they rejected.
 */
export type OptionState = 'idle' | 'selected' | 'correct' | 'missed' | 'incorrect' | 'dimmed';

export function AnswerOption({
  text,
  state = 'idle',
  shape = 'circle',
  badge,
  onPress,
  disabled,
}: {
  text: string;
  state?: OptionState;
  /** Circle for one-of-many, rounded square for many-of-many. */
  shape?: 'circle' | 'square';
  badge?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  const surface: Record<OptionState, string> = {
    idle: 'bg-card border-[1.5px] border-hairline',
    selected: 'bg-brand-tint border-2 border-brand',
    correct: 'bg-brand-tint border-2 border-brand',
    missed: 'bg-card border-2 border-dashed border-brand',
    incorrect: 'bg-error-tint border-2 border-error',
    dimmed: 'bg-card border-[1.5px] border-hairline opacity-50',
  };

  const indicator = () => {
    const size = 22;
    const radius = shape === 'circle' ? size / 2 : 6;

    if (state === 'correct' || state === 'selected') {
      return (
        <View
          style={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: radius,
            backgroundColor: theme.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="check" size={13} color="onBrand" />
        </View>
      );
    }

    if (state === 'missed') {
      return (
        <View
          style={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: radius,
            borderWidth: 1.75,
            borderColor: theme.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="check" size={12} color="brand" />
        </View>
      );
    }

    if (state === 'incorrect') {
      return (
        <View
          style={{
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: radius,
            backgroundColor: theme.error,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="close" size={12} color="onBrand" />
        </View>
      );
    }

    return (
      <View
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: radius,
          borderWidth: 1.75,
          borderColor: theme.borderStrong,
        }}
      />
    );
  };

  return (
    <Pressable
      accessibilityRole={shape === 'circle' ? 'radio' : 'checkbox'}
      accessibilityState={{
        checked: state === 'selected' || state === 'correct' || state === 'incorrect',
        disabled: !!disabled,
      }}
      // The state is spoken as a word, never as a colour.
      accessibilityLabel={badge ? `${text}، ${badge}` : text}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-[18px] px-4 py-3 ${surface[state]}`}
      style={{ minHeight: 52 }}>
      {indicator()}
      <Text
        variant="bodySm"
        weight={state === 'idle' || state === 'dimmed' ? 'semibold' : 'bold'}
        className="min-w-0 flex-1">
        {text}
      </Text>
      {badge ? (
        <Text
          variant="caption"
          weight="bold"
          color={state === 'incorrect' ? 'error' : 'brand'}
          style={{ fontSize: 11.5 }}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}
