import React, { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Elevation, Motion, Radius } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

/**
 * A bottom sheet: rises 260ms on a decelerate curve behind a 32% scrim, or
 * cross-fades in 140ms under Reduce Motion. Sheets and the offline banner are
 * the only places that carry `e2`.
 */
export function Sheet({
  visible,
  onClose,
  children,
  accessibilityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const theme = useTheme();
  // Held in state, not a ref: reading `ref.current` during render is exactly
  // the pattern that leaves an animation out of sync with the tree.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduced ? Motion.reducedDuration.sheet : Motion.duration.sheet,
      useNativeDriver: true,
    }).start();
  }, [visible, reduced, progress]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* Painted from tokens rather than classes: the animated wrapper is the
            one place where a missing class would leave the sheet transparent. */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.scrim,
            opacity: progress,
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          style={[
            Elevation.e2,
            {
              backgroundColor: theme.card,
              borderTopWidth: 1,
              borderColor: theme.hairline,
              borderTopStartRadius: Radius.sheet,
              borderTopEndRadius: Radius.sheet,
              paddingBottom: insets.bottom + 12,
              opacity: progress,
              transform: reduced
                ? []
                : [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
            },
          ]}>
          <View style={{ alignItems: 'center', paddingTop: 12 }}>
            <View
              style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.track }}
            />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
