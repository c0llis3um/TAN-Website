import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import useAppStore from '@/store/useAppStore'
import supabase from '@/lib/supabase'
import { cn } from '@/components/ui/cn'

const NAV = [
  { to: '/admin',             icon: '📊', label: 'Dashboard',     end: true  },
  { to: '/admin/pods',        icon: '🏘️', label: 'Pods'                       },
  { to: '/admin/users',       icon: '👥', label: 'Users'                      },
  { to: '/admin/ambassadors', icon: '🌟', label: 'Ambassadors'                },
  { to: '/admin/insurance',   icon: '🛡️', label: 'Insurance'                  },
  { to: '/admin/disputes',    icon: '⚖️', label: 'Disputes',      badge: 2   },
  { to: '/admin/revenue',     icon: '💰', label: 'Revenue'                    },
  { to: '/admin/waitlist',    icon: '📋', label: 'Waitlist',      badge: 47  },
  { to: '/admin/content',     icon: '📚', label: 'Content'                    },
  { to: '/admin/treasury',    icon: '🏦', label: 'Treasury'                   },
  { to: '/admin/settings',    icon: '⚙️', label: 'Settings'                   },
]

export default function AdminLayout() {
  const { env, setEnv, adminUser, logoutAdmin } = useAppStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    logoutAdmin()
    navigate('/admin/login')
  }
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen flex dark:bg-[#070f13] bg-slate-100">

      {/* ── Sidebar ── */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-shrink-0 flex flex-col dark:bg-brand-darker bg-white border-r dark:border-brand-border border-slate-200 z-10"
        style={{ minHeight: '100vh', position: 'sticky', top: 0 }}
      >
        {/* Logo row */}
        <div className="h-16 flex items-center justify-between px-4 border-b dark:border-brand-border border-slate-200">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <img src="/media/tlogo.png" alt="" className="w-7 h-7 flex-shrink-0 dark:brightness-[10] brightness-0" />
                <span className="font-bold text-sm dark:text-white text-slate-900 whitespace-nowrap">DeFi Tanda</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded dark:bg-brand-mid bg-slate-100 dark:text-brand-muted text-slate-500">ADMIN</span>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            {sidebarOpen ? '◀' : '▶'}
          </motion.button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ to, icon, label, badge, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-sm font-medium transition-all mb-0.5 relative group',
                isActive
                  ? 'bg-gradient-brand text-white shadow-glow-sm'
                  : 'dark:text-brand-muted text-slate-600 dark:hover:bg-brand-mid hover:bg-slate-100 dark:hover:text-white hover:text-slate-900'
              )}
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="whitespace-nowrap flex-1"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {badge && sidebarOpen && (
                <span className="ml-auto bg-brand-blue text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {badge}
                </span>
              )}
              {/* Tooltip when collapsed */}
              {!sidebarOpen && (
                <div className="absolute left-full ml-2 px-2 py-1 rounded-lg dark:bg-brand-mid bg-slate-800 text-white text-xs whitespace-nowrap
                  opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: back to site */}
        <div className="p-3 border-t dark:border-brand-border border-slate-200">
          <motion.button
            onClick={() => navigate('/')}
            whileHover={{ x: -2 }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs',
              'dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors'
            )}
          >
            <span>🌐</span>
            {sidebarOpen && <span>Back to site</span>}
          </motion.button>
        </div>
      </motion.aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-6 dark:bg-brand-darker bg-white border-b dark:border-brand-border border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Env badge */}
            <EnvToggle env={env} setEnv={setEnv} />
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-sm dark:text-brand-muted text-slate-500">
              <span className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">
                {adminUser?.email?.[0]?.toUpperCase() ?? 'A'}
              </span>
              <span className="hidden sm:block">{adminUser?.email ?? 'admin@defitanda.app'}</span>
              <button
                onClick={handleLogout}
                className="ml-1 px-2 py-1 text-xs rounded-lg dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key="admin-content"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function EnvToggle({ env, setEnv }) {
  const [confirming, setConfirming] = useState(false)
  const isDev = env === 'dev'

  const handleSwitch = () => {
    if (isDev) { setConfirming(true) }
    else { setEnv('dev') }
  }

  return (
    <>
      <motion.button
        onClick={handleSwitch}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
          isDev
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 hover:bg-amber-500/20'
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', isDev ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400')} />
        {isDev ? 'DEV — Testnet' : 'LIVE — Mainnet'}
        <span className="opacity-60">{isDev ? '↑ Switch to LIVE' : '↓ Switch to DEV'}</span>
      </motion.button>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setConfirming(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 max-w-sm w-full shadow-glow"
            >
              <div className="text-4xl text-center mb-4">⚠️</div>
              <h3 className="text-xl font-extrabold dark:text-white text-slate-900 text-center mb-3">Switch to LIVE?</h3>
              <ul className="text-sm dark:text-brand-muted text-slate-500 space-y-2 mb-6">
                {['Real blockchain contracts will be used','Real user funds are at risk','Ensure contracts are audited','Ensure treasury wallets are configured','Insurance pool must be ≥ $25,000'].map(w => (
                  <li key={w} className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span>{w}</li>
                ))}
              </ul>
              <p className="text-xs dark:text-brand-muted text-slate-400 text-center mb-6">
                Requires 2-of-3 super_admin approval. A confirmation email will be sent.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 font-semibold text-sm hover:opacity-80 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { alert('Approval request sent to all super_admins.'); setConfirming(false) }}
                  className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm hover:shadow-glow transition-all"
                >
                  Request Switch
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
