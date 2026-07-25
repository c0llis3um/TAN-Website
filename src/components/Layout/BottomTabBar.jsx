import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { IconHouses, IconCommunity, IconPlus, IconWallet } from '@/components/ui/Icons'

const TABS = [
  { to: '/app',         labelKey: 'nav.dashboard', Icon: IconHouses,   exact: true  },
  { to: '/app/pods',    labelKey: 'nav.myPods',    Icon: IconCommunity, exact: false },
  { to: '/app/create',  labelKey: 'nav.create',    Icon: IconPlus,      exact: false, emphasized: true },
  { to: '/app/wallet',  labelKey: 'nav.wallet',    Icon: IconWallet,    exact: false },
]

// Native-feeling bottom tab bar, mobile-only — the top nav already covers this
// on desktop. Safe-area-aware so it clears the home indicator on notched
// iPhones (needs viewport-fit=cover in index.html, already set).
export default function BottomTabBar() {
  const { t }      = useTranslation()
  const location    = useLocation()

  if (!location.pathname.startsWith('/app')) return null

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 dark:bg-brand-darker/95 bg-white/95 backdrop-blur-md border-t dark:border-brand-border border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-4 h-16">
        {TABS.map(({ to, labelKey, Icon, exact, emphasized }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <Link key={to} to={to} className="flex flex-col items-center justify-center gap-1 relative">
              {emphasized ? (
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="absolute -top-5 w-12 h-12 rounded-full bg-gradient-brand shadow-glow-sm flex items-center justify-center"
                >
                  <Icon className="w-6 h-6 text-white" />
                </motion.div>
              ) : (
                <motion.div whileTap={{ scale: 0.9 }} className="relative">
                  <Icon className={`w-6 h-6 ${active ? 'text-brand-cyan' : 'dark:text-brand-muted text-slate-400'}`} />
                  {active && (
                    <motion.span
                      layoutId="bottomTabDot"
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-cyan"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.div>
              )}
              <span className={`text-[10px] font-semibold ${emphasized ? 'mt-6' : ''} ${active ? 'text-brand-cyan' : 'dark:text-brand-muted text-slate-400'}`}>
                {t(labelKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
