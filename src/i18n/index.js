import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import zh from './zh.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, zh: { translation: zh } },
  lng: 'es',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
