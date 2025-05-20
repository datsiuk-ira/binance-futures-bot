// frontend/src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ['en', 'uk'],
    fallbackLng: 'en',
    debug: true,
    detection: {
      order: ['localStorage', 'cookie', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'],
    },
    ns: ['common'], // Make sure this matches your file structure
    defaultNS: 'common', // And this
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json', // Path relative to public folder
    },
    interpolation: {
      escapeValue: false,
    },
    // Added to see if resources are loaded at all
    // saveMissing: true, // if true, will send missing keys to backend. useful for development
    // missingKeyHandler: function(lng, ns, key, fallbackValue) {
    //   console.warn('Missing translation: ', lng, ns, key, fallbackValue);
    // }
  });

export default i18n;