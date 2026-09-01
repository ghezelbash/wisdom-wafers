import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

// Import translation files
import fa from './locales/fa.json';
import en from './locales/en.json';

const resources = {
  fa: { translation: fa },
  en: { translation: en },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'fa', // default to Farsi
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

// Force RTL layout if Farsi is selected
if (i18n.language === 'fa' && !I18nManager.isRTL) {
  I18nManager.forceRTL(true);
} else if (i18n.language !== 'fa' && I18nManager.isRTL) {
  I18nManager.forceRTL(false);
}

export default i18n;
