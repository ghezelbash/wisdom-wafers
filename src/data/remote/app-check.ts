import { Platform } from 'react-native';

/**
 * App Check, prepared but not enforced.
 *
 * The server counts how many calls arrive with a verified token and refuses
 * nothing — turning enforcement on before that number is known would lock out
 * every build already installed. `functions/src/shared/guard.ts` holds the
 * counter; this is the client half that produces the token.
 *
 * ### Why the native half is not here
 *
 * The Firebase **JS** SDK attests with reCAPTCHA, which needs a DOM. On Android
 * and iOS the attestation providers are Play Integrity and DeviceCheck, and
 * neither is reachable from the JS SDK — they are native modules, which means
 * React Native Firebase or an Expo config plugin wrapping the native App Check
 * SDK.
 *
 * So enforcement cannot be turned on for the mobile builds yet, whatever the
 * coverage number says, and the honest thing is to say so in one place rather
 * than to ship a provider that silently returns nothing. Web is wired because
 * it works there today and it exercises the whole path end to end — the token
 * arrives, the server counts it as verified, and the metric becomes meaningful.
 *
 * See `docs/adr/0022-callable-guard-and-app-check-rollout.md`.
 */

/** Set by the owner after registering the web app in the Firebase console. */
const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_APP_CHECK_RECAPTCHA_KEY;

/**
 * A debug token lets a development build produce a valid token without a real
 * site key. It is scoped to the projects the owner registers it against, and it
 * is read from the environment so it never lands in the repository.
 */
const DEBUG_TOKEN = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

export type AppCheckStatus =
  | 'active'
  | 'unconfigured'
  | 'unsupported-platform'
  | 'failed';

let status: AppCheckStatus | null = null;

export const appCheckStatus = (): AppCheckStatus | null => status;

/** Used by tests to observe a fresh decision. */
export function __resetAppCheck() {
  status = null;
}

/**
 * Attaches App Check to an initialised Firebase app, if it can.
 *
 * Never throws and never blocks startup: enforcement is off, so a build that
 * cannot attest is a build whose calls are counted as unverified — not a build
 * that fails to start.
 */
export async function ensureAppCheck(app: unknown): Promise<AppCheckStatus> {
  if (status) return status;

  if (Platform.OS !== 'web') {
    status = 'unsupported-platform';
    return status;
  }
  if (!RECAPTCHA_SITE_KEY) {
    status = 'unconfigured';
    return status;
  }

  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');

    if (DEBUG_TOKEN) {
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        DEBUG_TOKEN;
    }

    initializeAppCheck(app as Parameters<typeof initializeAppCheck>[0], {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    status = 'active';
  } catch {
    status = 'failed';
  }

  return status;
}
