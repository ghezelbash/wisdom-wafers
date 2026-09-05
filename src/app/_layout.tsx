import '../../global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/brand-splash';
import { useNotificationRouting } from '@/hooks/use-notification-routing';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogProvider } from '@/context/CatalogContext';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { bootstrapLocale } from '@/lib/locale';
import { AppGateScreen } from '@/components/app-gate-screen';
import { MisconfiguredEnvironment } from '@/components/misconfigured-environment';
import { appVariant } from '@/platform/app-info';
import { currentEnvironmentIssues } from '@/platform/env';
import { installTelemetrySinks } from '@/platform/telemetry-sink';
import { RemoteConfigProvider, useRemoteConfig } from '@/context/RemoteConfigContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [localeReady, setLocaleReady] = useState(false);

  // Analytics and crash reporting go through the outbox from the first frame,
  // so a crash during startup is still recorded and delivered later.
  useEffect(() => {
    installTelemetrySinks();
  }, []);

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ErrorBoundary>
        <RemoteConfigProvider>
          <AppGate>
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
          </AppGate>
        </RemoteConfigProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * Whether this build may run at all.
 *
 * Above the session and the catalogue, because it is not about what a reader
 * has done. Two states, and they are not symmetric:
 *
 *  - **maintenance** can be carried past, into a narrowly scoped shell where
 *    the backend-dependent flags are off and what is already on the device
 *    keeps working. The gate itself stays `maintenance` — it is not declared
 *    open, which is what the previous version did.
 *  - **update required** cannot. There was a way past it, the same action the
 *    maintenance state offers, which let a build the server has refused run
 *    the whole app.
 */
function AppGate({ children }: { children: React.ReactNode }) {
  const { gate, isReady, isMaintenanceAcknowledged, acknowledgeMaintenance, refresh } =
    useRemoteConfig();

  /**
   * Nothing mounts until the config settles.
   *
   * Rendering children first — to avoid a flash — meant the catalogue started
   * a remote refresh under the *shipped* flags, so a maintenance switch that
   * turns remote content off was still beaten to it by a fetch. The splash is
   * already up, and the fetch is bounded by `CONFIG_TIMEOUT_MS`, so waiting
   * costs nothing visible and cannot hang.
   */
  if (!isReady) return null;
  if (gate.state === 'open') return <>{children}</>;
  if (gate.state === 'maintenance' && isMaintenanceAcknowledged) return <>{children}</>;

  return (
    <AppGateScreen
      gate={gate}
      onRecheck={() => void refresh()}
      onContinueOffline={acknowledgeMaintenance}
    />
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
        {/* Named exactly as the files are. `seed`, `settings`, `topic`,
            `path` and `review` are directories, not routes — expo-router
            warned on every launch that no such route existed, and any options
            set on them would have applied to nothing. */}
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="seed/[id]/index" />
        <Stack.Screen name="seed/[id]/complete" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/storage" />
        <Stack.Screen name="settings/delete-account" />
        <Stack.Screen name="settings/about" />
        <Stack.Screen name="search" />
        <Stack.Screen name="topic/[id]" />
        <Stack.Screen name="path/[id]" />
        <Stack.Screen name="review/index" />
        <Stack.Screen name="review/session" />
      </Stack.Protected>

      <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
      <Stack.Screen name="notification-ask" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account-offer" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
