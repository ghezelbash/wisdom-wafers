import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * The one splash, continued.
 *
 * What this replaces was the Expo starter's overlay: after the native Dananeh
 * splash, the app drew a **full-screen Expo logo on Expo blue** and
 * animated it away. Every cold start showed another company's brand for six
 * hundred milliseconds, on a colour that appears nowhere else in the app.
 *
 * The overlay itself is worth keeping — it is what lets the native splash be
 * hidden *after* the first frame has been laid out, rather than before, which
 * is the difference between a clean hand-off and a white flash. So it stays,
 * and it is drawn to match: the same background colours and the same 124pt seed
 * mark as `expo-splash-screen` is configured with in `app.config.ts`. Change
 * one, change the other — that is why the numbers are named here.
 *
 * The result is a single continuous splash that fades into the app.
 */

/** Must match the `expo-splash-screen` plugin configuration exactly. */
export const SPLASH_BACKGROUND = { light: '#F7F4EA', dark: '#171A17' };
export const SPLASH_IMAGE_WIDTH = 124;

const DURATION = 450;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const scheme = useColorScheme();

  if (!visible) return null;

  const dark = scheme === 'dark';
  const background = dark ? SPLASH_BACKGROUND.dark : SPLASH_BACKGROUND.light;

  // A fade, not a bounce. The native splash does not move, so anything but a
  // dissolve reads as a second screen appearing.
  const fade = new Keyframe({
    0: { opacity: 1 },
    100: { opacity: 0, easing: Easing.out(Easing.quad) },
  });

  const mark = (
    <Image
      style={styles.image}
      contentFit="contain"
      source={
        dark
          ? require('@/assets/brand/splash-icon-dark.png')
          : require('@/assets/brand/splash-icon.png')
      }
    />
  );

  return animate ? (
    <Animated.View
      entering={fade.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={[styles.overlay, { backgroundColor: background }]}>
      {mark}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        // Hidden only once there is a frame behind it, so the hand-off never
        // shows the window's own background.
        SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={[styles.overlay, { backgroundColor: background }]}>
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  image: {
    width: SPLASH_IMAGE_WIDTH,
    height: SPLASH_IMAGE_WIDTH,
  },
});
