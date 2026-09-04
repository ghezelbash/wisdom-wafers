import '../../global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogProvider } from '@/context/CatalogContext';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { bootstrapLocale } from '@/lib/locale';
import { AppGateScreen } from '@/components/app-gate-screen';
import { MisconfiguredEnvironment } from '@/components/misconfigured-environment';
import { appVariant, appVersion } from '@/platform/app-info';
import { currentEnvironmentIssues } from '@/platform/env';
import { installTelemetrySinks } from '@/platform/telemetry-sink';
import { refreshRemoteConfig } from '@/platform/remote-config';
import type { GateState } from '@/platform/app-gate';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [localeReady, setLocaleReady] = useState(false);
  const [gate, setGate] = useState<GateState>({ state: 'open' });

  // Analytics and crash reporting go through the outbox from the first frame,
  // so a crash during startup is still recorded and delivered later.
  useEffect(() => {
    installTelemetrySinks();
  }, []);

  /**
   * The one document that can change how a shipped binary behaves.
   *
   * It fails open: unreachable, absent or malformed leaves the app exactly as
   * it shipped. A kill switch that bricks the app when the config service has a
   * bad day is worse than the problem it solves.
   */
  const checkGate = React.useCallback(() => {
    refreshRemoteConfig(appVersion())
      .then((remote) => setGate(remote.gate))
      .catch(() => setGate({ state: 'open' }));
  }, []);

  useEffect(checkGate, [checkGate]);

  // Locale is resolved once, before the first screen renders, rather than as an
  // import side effect — that is what made switching direction need a reload.
  useEffect(() => {
    bootstrapLocale().finally(() => setLocaleReady(true));
  }, []);

  const [fontsLoaded] = useFonts({
    'YekanBakh-Regular': require('../../assets/fonts/YekanBakhFaNum-Regular.ttf'),
    'YekanBakh-SemiBold': require('../../assets/fonts/YekanBakhFaNum-SemiBold.ttf'),
    'YekanBakh-Bold': require('../../assets/fonts/YekanBakhFaNum-Bold.ttf'),
    'YekanBakh-ExtraBold': require('../../assets/fonts/YekanBakhFaNum-ExtraBold.ttf'),
  });

  if (!fontsLoaded || !localeReady) {
    return null; // The splash screen stays up until both are ready.
  }

  /**
   * A staging or production binary that cannot reach its backend says so.
   *
   * The same rules ran at build time, so reaching this means the binary was
   * assembled some other way. Falling through to a device-local identity here
   * is what made the original misconfiguration invisible: sign-in simply "did
   * not work", with nothing on screen to act on.
   */
  const issues = currentEnvironmentIssues(appVariant());
  if (issues.length) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <MisconfiguredEnvironment issues={issues} />
      </ThemeProvider>
    );
  }

  // Maintenance and forced update sit outside the providers: they are about
  // whether this build may run at all, not about what a reader has done.
  if (gate.state !== 'open') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppGateScreen
          gate={gate}
          onRecheck={checkGate}
          onOpenGarden={() => setGate({ state: 'open' })}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ErrorBoundary>
        <SessionProvider>
          <CatalogProvider>
            <AuthProvider>
              <AnimatedSplashOverlay />
              <View
                className={`w-full flex-1 bg-canvas ${
                  Platform.OS === 'web'
                    ? 'md:mx-auto md:max-w-[480px] md:border-x md:border-hairline'
                    : ''
                }`}>
                <RootNavigator />
              </View>
            </AuthProvider>
          </CatalogProvider>
        </SessionProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * Routing is guest-first: there is no login wall. A reader who has not finished
 * onboarding sees only that flow; everyone else gets the whole app, account or
 * not. `auth` stays reachable from both, as an offer rather than a gate.
 */
function RootNavigator() {
  const { session, isReady } = useSession();

  // A reminder opens the thing it was about, not the home screen.
  useNotificationRouting(session.onboarded);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Protected guard={!session.onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={session.onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="seed" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="search" />
        <Stack.Screen name="topic" />
        <Stack.Screen name="path" />
        <Stack.Screen name="review" />
      </Stack.Protected>

      <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
      <Stack.Screen name="notification-ask" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account-offer" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
