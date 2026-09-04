import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

import i18n, { AppLocale, RTL_LOCALES, SUPPORTED_LOCALES, initI18n } from '@/i18n';

const STORAGE_KEY = 'dananeh.locale.v1';

export const isRtlLocale = (locale: AppLocale) => RTL_LOCALES.includes(locale);

function isSupported(value: string | null | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Stored choice, else Persian.
 *
 * The device language is deliberately not consulted: seeds ship in Persian, so
 * an English device would otherwise get English chrome wrapped around Persian
 * content. English is a supported port the reader chooses, not a default they
 * land in.
 */
function resolveLocale(stored: string | null): AppLocale {
  return isSupported(stored) ? stored : 'fa';
}

/**
 * On web, direction comes from the document: react-native-web maps
 * `marginStart` and friends onto CSS logical properties, which resolve against
 * `dir` — `I18nManager` alone leaves the DOM laid out left-to-right.
 */
function applyDocumentDirection(locale: AppLocale, rtl: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}

/**
 * Reads the locale, initialises i18next and aligns layout direction — once, at
 * startup, before the first screen renders.
 *
 * `needsRestart` is true when the direction changed on a platform that only
 * applies it on the next launch. The caller decides what to say about that; on
 * web the change takes effect immediately.
 */
export async function bootstrapLocale(): Promise<{ locale: AppLocale; needsRestart: boolean }> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // A read failure is not worth blocking launch; fall back to the device locale.
  }

  const locale = resolveLocale(stored);
  initI18n(locale);

  const rtl = isRtlLocale(locale);
  I18nManager.allowRTL(rtl);
  applyDocumentDirection(locale, rtl);

  let needsRestart = false;
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    needsRestart = Platform.OS !== 'web';
  }

  return { locale, needsRestart };
}

/** Switches locale and persists it. Returns whether the app must relaunch for
 *  the direction change to take effect. */
export async function setLocale(locale: AppLocale): Promise<{ needsRestart: boolean }> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Persisting is best-effort; the in-memory switch below still happens.
  }

  await i18n.changeLanguage(locale);

  const rtl = isRtlLocale(locale);
  I18nManager.allowRTL(rtl);
  applyDocumentDirection(locale, rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return { needsRestart: Platform.OS !== 'web' };
  }
  return { needsRestart: false };
}
