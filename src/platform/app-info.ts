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

/** The variant this binary was built as — development, staging or production. */
export function appVariant(): 'development' | 'staging' | 'production' {
  const variant = (Constants.expoConfig?.extra as { variant?: string } | undefined)?.variant;
  return variant === 'development' || variant === 'staging' ? variant : 'production';
}
