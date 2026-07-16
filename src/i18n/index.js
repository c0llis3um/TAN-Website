import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import zh from './zh.json'

// The language picker in Navbar.jsx is a <select> controlled by
// useAppStore's persisted `lang`. If i18n initializes to a hardcoded
// language that doesn't match what's in localStorage, the <select>'s value
// (from the store) and the actually-rendered language (from i18n) start out
// of sync — e.g. a returning English user sees Spanish text but "EN" already
// selected in the dropdown, so picking "English" again is a no-op (the
// <select>'s value doesn't change, so onChange never fires) and only
// picking a different language first, then English, actually triggers the
// switch. Reading the persisted language here keeps the two in sync from
// the first render.
function getPersistedLang() {
  try {
    const stored = JSON.parse(localStorage.getItem('defi-tanda-store'))
    return stored?.state?.lang ?? 'es'
  } catch {
    return 'es'
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, zh: { translation: zh } },
  lng: getPersistedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
