import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import i18n from './i18n/index'
import './index.css'
import useAppStore from './store/useAppStore'

// Apply persisted theme before first render
useAppStore.getState().initTheme()

// Expose store and i18n for Playwright e2e tests (dev only)
if (import.meta.env.DEV) {
  window.__tanStore = useAppStore
  window.__i18n = i18n
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
