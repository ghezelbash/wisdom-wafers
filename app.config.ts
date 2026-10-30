import type { ExpoConfig } from 'expo/config';

// Plain CommonJS: the Expo config loader transpiles this file on its own and
// does not resolve TypeScript imports. `src/platform/env.ts` is the typed
// façade over the same rules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertEnvironment, readVariant } = require('./config/env');

type Variant = 'development' | 'staging' | 'production';

/**
 * App config, per environment.
 *
 * dev, staging and production get their own bundle identifier and scheme so all
 * three can sit on one device and a deep link can never open the wrong one.
 * `APP_VARIANT` selects; anything else falls back to production.
 *
 * The environment is validated **here**, at config-evaluation time, so a
 * staging or production build with missing or mismatched Firebase configuration
 * fails before Metro starts rather than shipping a binary that quietly falls
 * back to a device-local identity.
 */

const variant: Variant = readVariant(process.env.APP_VARIANT);

assertEnvironment({
  variant,
  env: process.env,
  usingEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1',
});

const IDENTITY: Record<Variant, { suffix: string; nameSuffix: string; scheme: string }> = {
  development: { suffix: '.dev', nameSuffix: ' (Dev)', scheme: 'dananeh-dev' },
  staging: { suffix: '.staging', nameSuffix: ' (Staging)', scheme: 'dananeh-staging' },
  production: { suffix: '', nameSuffix: '', scheme: 'dananeh' },
};

const identity = IDENTITY[variant];
const bundleId = `com.dananeh.app${identity.suffix}`;

const config: ExpoConfig = {
  name: `Dananeh${identity.nameSuffix}`,
  slug: 'dananeh',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/brand/app-icon-1024.png',
  scheme: identity.scheme,
  userInterfaceStyle: 'automatic',
  // The app is Persian-first; iOS shows the localized name on the home screen.
  /**
   * Per-locale strings, nested by platform.
   *
   * `CFBundleDisplayName` is an iOS Info.plist key. Unnested, Expo wrote it
   * into Android's `values-b+fa/strings.xml` as well, where it does nothing —
   * the launcher reads `app_name` — and where Android's release lint failed the
   * build outright:
   *
   *     values-b+fa/strings.xml: Error: "CFBundleDisplayName" is translated
   *     here but not found in default locale [ExtraTranslation]
   *
   * `lintVitalRelease` treats that as fatal, so every release APK failed while
   * every debug build passed. Nesting under `ios` is what the SDK 57 config
   * documents, and it keeps the key on the platform it belongs to.
   */
  locales: {
    fa: './assets/locales/fa.json',
  },
  ios: {
    icon: './assets/brand/app-icon-1024.png',
    bundleIdentifier: bundleId,
    supportsTablet: false,
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#65A96B',
      foregroundImage: './assets/brand/android-adaptive-foreground.png',
      monochromeImage: './assets/brand/android-adaptive-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    /**
     * Reflections are private and on-device only, and that is what the app
     * tells the reader. Android's auto-backup is on by default and would copy
     * the SQLite database into their Google account — a different promise from
     * the one made. Off until there is a backup rule that excludes it and a
     * sentence in the privacy policy describing what is included.
     */
    allowBackup: false,
    /**
     * Android 13+ requires this to be declared before `requestPermissionsAsync`
     * can show anything; without it the ask silently no-ops and the reader is
     * left with a switch that does nothing.
     */
    permissions: ['android.permission.POST_NOTIFICATIONS'],
  },
  web: {
    output: 'static',
    favicon: './assets/brand/favicon.png',
  },
  // React Native Firebase's config plugin and the per-variant
  // `googleServicesFile` land here when the native migration runs; see
  // docs/runbooks/native-migration.md. Adding them before the credential files
  // exist breaks `expo prebuild`, so they are staged in the runbook, not here.
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-notifications',
      {
        // Android requires a 96x96 all-white glyph on transparency and applies
        // this brand colour as the system tint.
        icon: './assets/brand/notification-icon.png',
        color: '#2F6D4B',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F7F4EA',
        dark: {
          backgroundColor: '#171A17',
          image: './assets/brand/splash-icon-dark.png',
        },
        image: './assets/brand/splash-icon.png',
        imageWidth: 124,
      },
    ],
  ],
  // Updates only reach a binary with a compatible runtime: any native or
  // config-plugin change means a new build, not an over-the-air push.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    variant,
    // Required by EAS Build and by push notifications. Supplied by the EAS
    // environment; absent locally, which is fine — a local run does neither.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
