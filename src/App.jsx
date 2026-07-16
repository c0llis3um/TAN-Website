import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Navbar from '@/components/Layout/Navbar'
import Footer from '@/components/Layout/Footer'
import DevBanner from '@/components/DevBanner'
import useAppStore from '@/store/useAppStore'
import { getPlatformSetting } from '@/lib/db'

import Landing      from '@/pages/Landing'
import Pitch        from '@/pages/Pitch'
import FAQ          from '@/pages/FAQ'
import Dashboard    from '@/pages/app/Dashboard'
import PodView      from '@/pages/app/PodView'
import Pay          from '@/pages/app/Pay'
import CreatePod    from '@/pages/app/CreatePod'
import BrowsePods   from '@/pages/app/BrowsePods'
import WalletPage   from '@/pages/app/Wallet'

import RequireAdmin      from '@/components/RequireAdmin'
import AdminLogin        from '@/pages/admin/Login'
import AdminLayout       from '@/pages/admin/AdminLayout'
import AdminDash         from '@/pages/admin/Dashboard'
import AdminPods         from '@/pages/admin/Pods'
import AdminUsers        from '@/pages/admin/Users'
import AdminAmbassadors  from '@/pages/admin/Ambassadors'
import AdminInsurance    from '@/pages/admin/Insurance'
import AdminDisputes     from '@/pages/admin/Disputes'
import AdminRevenue      from '@/pages/admin/Revenue'
import AdminWaitlist     from '@/pages/admin/Waitlist'
import AdminTreasury     from '@/pages/admin/Treasury'
import AdminAnomalies    from '@/pages/admin/Anomalies'
import AdminSettings     from '@/pages/admin/Settings'
import AdminContent      from '@/pages/admin/Content'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.2 } },
}

function PageWrapper({ children }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  const isAdmin  = location.pathname.startsWith('/admin')
  const setEnv   = useAppStore((s) => s.setEnv)

  // env is now a site-wide setting (platform_settings.env), not a per-browser
  // toggle — every visitor picks it up here so an admin's live/dev switch
  // actually applies to everyone, not just their own browser. VITE_FORCE_ENV
  // (set in a local, gitignored .env.local — never present in a real deploy)
  // overrides this for local testing, so localhost can sit on testnet without
  // ever touching the shared platform_settings row the live site reads.
  useEffect(() => {
    const forced = import.meta.env.VITE_FORCE_ENV
    if (forced === 'dev' || forced === 'live') {
      setEnv(forced)
      return
    }
    getPlatformSetting('env').then((v) => {
      if (v === 'dev' || v === 'live') setEnv(v)
    })
  }, [setEnv])

  return (
    <div className="min-h-screen flex flex-col dark:bg-brand-dark bg-slate-50 dark:text-brand-text text-slate-800">
      <DevBanner />
      {!isAdmin && <Navbar />}

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* ── Public ── */}
            <Route path="/" element={<PageWrapper><Landing /></PageWrapper>} />
            <Route path="/pitch" element={<PageWrapper><Pitch /></PageWrapper>} />
            <Route path="/faq" element={<PageWrapper><FAQ /></PageWrapper>} />

            {/* ── User App ── */}
            <Route path="/app"              element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route path="/app/pod/:id"      element={<PageWrapper><PodView /></PageWrapper>} />
            <Route path="/app/pod/:id/pay"  element={<PageWrapper><Pay /></PageWrapper>} />
            <Route path="/app/create"       element={<PageWrapper><CreatePod /></PageWrapper>} />
            <Route path="/app/pods"          element={<PageWrapper><BrowsePods /></PageWrapper>} />
            <Route path="/app/wallet"       element={<PageWrapper><WalletPage /></PageWrapper>} />

            {/* ── Admin ── */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index                    element={<AdminDash />} />
              <Route path="pods"              element={<AdminPods />} />
              <Route path="users"             element={<AdminUsers />} />
              <Route path="ambassadors"       element={<AdminAmbassadors />} />
              <Route path="insurance"         element={<AdminInsurance />} />
              <Route path="disputes"          element={<AdminDisputes />} />
              <Route path="revenue"           element={<AdminRevenue />} />
              <Route path="waitlist"          element={<AdminWaitlist />} />
              <Route path="treasury"          element={<AdminTreasury />} />
              <Route path="anomalies"         element={<AdminAnomalies />} />
              <Route path="content"           element={<AdminContent />} />
              <Route path="settings"          element={<AdminSettings />} />
            </Route>
          </Routes>
        </AnimatePresence>
      </main>

      {!isAdmin && <Footer />}
    </div>
  )
}
