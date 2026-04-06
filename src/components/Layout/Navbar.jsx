import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Button from '@/components/ui/Button'
import WalletModal from '@/components/WalletModal'
import useAppStore from '@/store/useAppStore'
import { onAccountChanged, onChainChanged, removeWalletListeners, disconnectWallet as disconnectProvider } from '@/lib/wallets'

const LANGS = ['es', 'en', 'zh']

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const location    = useLocation()
  const navigate    = useNavigate()
  const { wallet, setWallet, disconnectWallet, lang, setLang } = useAppStore()
  const [scrolled,     setScrolled]     = useState(false)
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [walletModal,  setWalletModal]  = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const isLanding = location.pathname === '/'
  const isApp     = location.pathname.startsWith('/app')

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Auto-restore MetaMask session on page load (if already connected)
  useEffect(() => {
    if (wallet || !window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
      if (!accounts?.length) return
      window.ethereum.request({ method: 'eth_chainId' }).then(chainIdHex => {
        const chainId   = parseInt(chainIdHex, 16)
        const chainName = { 1: 'Ethereum Mainnet', 11155111: 'Sepolia Testnet', 137: 'Polygon', 8453: 'Base', 31337: 'Hardhat Local' }[chainId] ?? `Chain ${chainId}`
        setWallet({ address: accounts[0], chain: 'Ethereum', chainId, chainName, provider: 'metamask' })
      })
    }).catch(() => {})
  }, [])

  // Keep app state in sync if user switches account or chain in MetaMask
  useEffect(() => {
    if (!wallet) return

    onAccountChanged((newAddress) => {
      if (!newAddress) {
        disconnectWallet()
      } else {
        setWallet({ ...wallet, address: newAddress })
      }
    })

    onChainChanged((chainId) => {
      setWallet({ ...wallet, chainId })
    })

    return () => removeWalletListeners()
  }, [wallet])

  const toggleLang = () => {
    const idx = LANGS.indexOf(lang)
    const next = LANGS[(idx + 1) % LANGS.length]
    setLang(next)
    i18n.changeLanguage(next)
  }

  const handleDisconnect = async () => {
    await disconnectProvider(wallet?.provider)
    disconnectWallet()
    setDropdownOpen(false)
  }

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={`sticky top-0 z-40 transition-all duration-300
          ${scrolled
            ? 'dark:bg-brand-darker/95 bg-white/95 backdrop-blur-md shadow-lg dark:shadow-brand-blue/5 shadow-slate-200/60 border-b dark:border-brand-border border-slate-200'
            : 'dark:bg-transparent bg-transparent'
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <motion.img
              src="/media/tlogo.png"
              alt="DeFi Tanda"
              className="w-8 h-8 dark:brightness-[10] brightness-0"
              whileHover={{ rotate: 15, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400 }}
            />
            <span className="font-bold text-lg dark:text-white text-slate-900 group-hover:gradient-text transition-all">
              DeFi Tanda
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {isLanding && (
              <>
                <NavLink href="#how">{t('nav.howItWorks')}</NavLink>
                <NavLink href="#chains">{t('nav.chains')}</NavLink>
                <NavLink href="#learn">{t('nav.learn')}</NavLink>
              </>
            )}
            {isApp && (
              <>
                <NavLink to="/app">{t('nav.dashboard')}</NavLink>
                <NavLink to="/app/pods">{t('nav.myPods')}</NavLink>
                <NavLink to="/app/create">{t('nav.create')}</NavLink>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <motion.button
              onClick={toggleLang}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="text-xs font-bold dark:text-brand-muted text-slate-500 hover:text-brand-blue transition-colors px-2 py-1 rounded-lg dark:hover:bg-brand-mid hover:bg-slate-100"
            >
              {lang === 'es' ? '🇲🇽 ES' : lang === 'zh' ? '🇨🇳 中文' : '🇺🇸 EN'}
            </motion.button>

            <ThemeToggle />

            {isLanding && (
              <>
                <Button size="sm" variant="outline" onClick={() => navigate('/app')}>
                  {t('nav.launchApp')}
                </Button>
                <Button size="sm" onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}>
                  {t('nav.joinWaitlist')}
                </Button>
              </>
            )}

            {isApp && (
              wallet ? (
                /* Connected — show address pill with dropdown */
                <div className="relative">
                  <motion.button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl dark:bg-brand-mid bg-slate-100 dark:border-brand-border border border-slate-200 hover:border-brand-blue/50 transition-all"
                  >
                    <WalletProviderDot provider={wallet.provider} />
                    <span className="text-xs font-mono dark:text-brand-text text-slate-700">
                      {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                    </span>
                    <span className="text-xs dark:text-brand-muted text-slate-400">▾</span>
                  </motion.button>

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0,  scale: 1    }}
                        exit={{    opacity: 0, y: -6, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-52 dark:bg-brand-darker bg-white rounded-2xl border dark:border-brand-border border-slate-200 shadow-glow overflow-hidden z-50"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <div className="px-4 py-3 border-b dark:border-brand-border border-slate-100">
                          <p className="text-xs dark:text-brand-muted text-slate-400">{wallet.chainName ?? wallet.chain}</p>
                          <p className="font-mono text-xs dark:text-white text-slate-900 mt-0.5 truncate">{wallet.address}</p>
                        </div>
                        <button
                          onClick={() => { navigate('/app/wallet'); setDropdownOpen(false) }}
                          className="w-full text-left px-4 py-3 text-sm dark:text-brand-text text-slate-700 dark:hover:bg-brand-mid hover:bg-slate-50 transition-colors flex items-center gap-2"
                        >
                          <span>👛</span> {t('nav.wallet')}
                        </button>
                        <button
                          onClick={() => { navigator.clipboard.writeText(wallet.address); setDropdownOpen(false) }}
                          className="w-full text-left px-4 py-3 text-sm dark:text-brand-text text-slate-700 dark:hover:bg-brand-mid hover:bg-slate-50 transition-colors"
                        >
                          {t('common.copy')}
                        </button>
                        <button
                          onClick={handleDisconnect}
                          className="w-full text-left px-4 py-3 text-sm text-red-400 dark:hover:bg-red-500/8 hover:bg-red-50 transition-colors"
                        >
                          {t('common.disconnect')}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                /* Not connected */
                <Button size="sm" onClick={() => setWalletModal(true)}>
                  {t('common.connectWallet')}
                </Button>
              )
            )}

            {/* Mobile hamburger */}
            <motion.button
              className="md:hidden p-2 rounded-xl dark:text-brand-text text-slate-600 dark:hover:bg-brand-mid hover:bg-slate-100"
              onClick={() => setMobileOpen(!mobileOpen)}
              whileTap={{ scale: 0.9 }}
            >
              <span className="text-lg">{mobileOpen ? '✕' : '☰'}</span>
            </motion.button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden dark:bg-brand-darker bg-white border-t dark:border-brand-border border-slate-200 px-4 pb-4"
            >
              <div className="flex flex-col gap-1 pt-3">
                {isLanding && (
                  <>
                    <MobileLink href="#how" onClick={() => setMobileOpen(false)}>{t('nav.howItWorks')}</MobileLink>
                    <MobileLink href="#chains" onClick={() => setMobileOpen(false)}>{t('nav.chains')}</MobileLink>
                    <MobileLink href="#learn" onClick={() => setMobileOpen(false)}>{t('nav.learn')}</MobileLink>
                  </>
                )}
                {isApp && (
                  <>
                    <MobileLink to="/app"        onClick={() => setMobileOpen(false)}>{t('nav.dashboard')}</MobileLink>
                    <MobileLink to="/app/pods"   onClick={() => setMobileOpen(false)}>{t('nav.myPods')}</MobileLink>
                    <MobileLink to="/app/create" onClick={() => setMobileOpen(false)}>{t('nav.create')}</MobileLink>
                  </>
                )}
                {isApp && !wallet && (
                  <button
                    onClick={() => { setMobileOpen(false); setWalletModal(true) }}
                    className="mt-2 w-full py-3 rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm"
                  >
                    {t('common.connectWallet')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Wallet connect modal */}
      <AnimatePresence>
        {walletModal && <WalletModal onClose={() => setWalletModal(false)} />}
      </AnimatePresence>
    </>
  )
}

function WalletProviderDot({ provider }) {
  if (provider === 'metamask') {
    return <span className="text-sm">🦊</span>
  }
  if (provider === 'phantom') {
    return <span className="text-sm">👻</span>
  }
  return <span className="w-2 h-2 rounded-full bg-emerald-400" />
}

function NavLink({ href, to, children, external }) {
  const base = 'px-3 py-2 rounded-xl text-sm font-medium dark:text-brand-muted text-slate-600 dark:hover:text-white hover:text-slate-900 dark:hover:bg-brand-mid hover:bg-slate-100 transition-all'
  if (external) return <a href={href} target="_blank" rel="noreferrer" className={base}>{children}</a>
  if (href)     return <a href={href} className={base}>{children}</a>
  return <Link to={to} className={base}>{children}</Link>
}

function MobileLink({ href, to, children, onClick }) {
  const base = 'px-3 py-3 rounded-xl text-sm font-medium dark:text-brand-text text-slate-700 dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors block'
  if (href) return <a href={href} className={base} onClick={onClick}>{children}</a>
  return <Link to={to} className={base} onClick={onClick}>{children}</Link>
}
