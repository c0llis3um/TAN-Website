import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAppStore = create(
  persist(
    (set, get) => ({
      /* ── Theme ── */
      theme: 'dark',
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.classList.toggle('dark', next === 'dark')
        set({ theme: next })
      },
      initTheme: () => {
        const t = get().theme
        document.documentElement.classList.toggle('dark', t === 'dark')
      },

      /* ── Language ── */
      lang: 'es',
      setLang: (lang) => set({ lang }),

      /* ── Environment ── */
      env: 'dev', // 'dev' | 'live'
      setEnv: (env) => set({ env }),

      /* ── Wallet / Auth ── */
      wallet: null,          // { address, chain, alias }
      setWallet: (w) => set({ wallet: w }),
      disconnectWallet: () => set({ wallet: null }),

      /* ── Admin Auth ── */
      adminUser: null,       // { email, role }
      setAdminUser: (u) => set({ adminUser: u }),
      logoutAdmin: () => set({ adminUser: null }),
    }),
    {
      name: 'defi-tanda-store',
      partialState: (s) => ({
        theme:     s.theme,
        lang:      s.lang,
        env:       s.env,
        adminUser: s.adminUser,
      }),
    }
  )
)

export default useAppStore
