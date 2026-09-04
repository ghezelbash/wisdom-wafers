// `use` is aliased: imported bare, the React hooks rule reads it as React's
// `use` hook and rejects the call site.
import i18n, { changeLanguage, use as configure } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fa from './locales/fa.json';

export const SUPPORTED_LOCALES = ['fa', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly AppLocale[] = ['fa'];

const resources = {
  fa: { translation: fa },
  en: { translation: en },
};

/**
 * Initialises i18next for a resolved locale.
 *
 * Nothing here touches layout direction, and nothing runs on import — see
 * `src/lib/locale.ts`, which owns the bootstrap. Forcing RTL at import time is
 * what made the old version need a reload to switch direction.
 */
export function initI18n(locale: AppLocale) {
  if (!i18n.isInitialized) {
    configure(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });
  } else if (i18n.language !== locale) {
    changeLanguage(locale);
  }
  return i18n;
}

export default i18n;
