import Constants from 'expo-constants';

/**
 * What build this is.
 *
 * Every progress event and every crash report carries it, so a failure can be
 * traced to a binary rather than to "the app". Read through `expo-constants`
 * rather than hard-coded, so a version bump in `app.config.ts` is the only
 * place the number lives.
 */
export function appVersion(): string {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.length ? version : '0.0.0';
}

/**
 * The environment this binary was built for.
 *
 * Read from `EXPO_PUBLIC_ENV_NAME` first, because Expo inlines `EXPO_PUBLIC_*`
 * into the bundle at build time — it is always there if it was there when the
 * build was made. `Constants.expoConfig.extra` is **not** reliable at runtime
 * (it is empty on web), and reading it first made every dev server look like a
 * production build.
 *
 * `APP_VARIANT` itself is deliberately not readable here: it is not an
 * `EXPO_PUBLIC_` variable, so it does not survive into the bundle. That is why
 * the variant/environment cross-check belongs at build time, where both values
 * exist — see `config/env.js`.
 */
export function appVariant(): 'development' | 'staging' | 'production' {
  const declared =
    process.env.EXPO_PUBLIC_ENV_NAME ??
    (Constants.expoConfig?.extra as { variant?: string } | undefined)?.variant;

  return declared === 'development' || declared === 'staging' ? declared : 'production';
}
