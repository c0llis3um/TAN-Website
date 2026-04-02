import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  isMetaMaskInstalled, connectMetaMask,
  isPhantomInstalled,  connectPhantom,
  isXamanInstalled,    connectXaman,
  disconnectWallet as disconnectProvider,
} from '@/lib/wallets'
import useAppStore from '@/store/useAppStore'

const WALLETS = [
  {
    id:         'metamask',
    name:       'MetaMask',
    chains:     'Ethereum · EVM',
    icon:       MetaMaskIcon,
    connect:    connectMetaMask,
    installed:  isMetaMaskInstalled,
    installUrl: 'https://metamask.io/download/',
  },
  {
    id:         'xaman',
    name:       'Xaman',
    chains:     'XRP Ledger · RLUSD',
    icon:       XamanIcon,
    connect:    connectXaman,
    installed:  isXamanInstalled,
    installUrl: 'https://xumm.app',
  },
]

export default function WalletModal({ onClose }) {
  const { setWallet } = useAppStore()
  const [loading, setLoading]   = useState(null)   // wallet id currently connecting
  const [error, setError]       = useState(null)
  const [connected, setConnected] = useState(null) // wallet info after success

  const handleConnect = async (w) => {
    setError(null)

    if (!w.installed()) {
      window.open(w.installUrl, '_blank')
      return
    }

    setLoading(w.id)
    try {
      const info = await w.connect()
      setConnected(info)
      setWallet(info)
      setTimeout(onClose, 1400)  // close after brief success flash
    } catch (err) {
      setError(typeof err === 'string' ? err : err?.message ?? 'Connection rejected.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 20 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        exit={{    scale: 0.92, opacity: 0         }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow"
      >
        <AnimatePresence mode="wait">

          {/* ── Success state ── */}
          {connected ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <motion.div
                className="w-16 h-16 rounded-full bg-gradient-brand mx-auto flex items-center justify-center mb-4 shadow-glow"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              >
                <span className="text-3xl">✓</span>
              </motion.div>
              <h3 className="text-lg font-extrabold dark:text-white text-slate-900 mb-1">Connected!</h3>
              <p className="font-mono text-xs dark:text-brand-muted text-slate-400">
                {connected.address.slice(0, 8)}…{connected.address.slice(-6)}
              </p>
              <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">{connected.chainName}</p>
            </motion.div>

          ) : (
            /* ── Select wallet ── */
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-extrabold dark:text-white text-slate-900">Connect Wallet</h2>
                <button
                  onClick={onClose}
                  className="text-2xl leading-none dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors"
                >×</button>
              </div>

              <div className="space-y-3 mb-5">
                {WALLETS.map(w => {
                  const installed = w.installed()
                  const isLoading = loading === w.id
                  const Icon      = w.icon

                  return (
                    <motion.button
                      key={w.id}
                      onClick={() => handleConnect(w)}
                      disabled={!!loading}
                      whileHover={!loading ? { scale: 1.02, y: -1 } : {}}
                      whileTap={!loading  ? { scale: 0.98 }         : {}}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
                        ${isLoading
                          ? 'border-brand-blue/60 dark:bg-brand-blue/10 bg-blue-50'
                          : 'dark:border-brand-border border-slate-200 dark:hover:border-brand-blue/50 hover:border-brand-blue/50 dark:hover:bg-brand-mid/40 hover:bg-slate-50'
                        }
                        disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 dark:bg-brand-dark bg-slate-50">
                        <Icon />
                      </div>

                      <div className="flex-1">
                        <p className="font-bold dark:text-white text-slate-900 text-sm">{w.name}</p>
                        <p className="text-xs dark:text-brand-muted text-slate-400">{w.chains}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {isLoading ? (
                          <motion.div
                            className="w-5 h-5 rounded-full border-2 border-brand-blue border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                          />
                        ) : installed ? (
                          <span className="text-xs font-semibold text-emerald-400">Detected</span>
                        ) : (
                          <span className="text-xs font-semibold dark:text-brand-muted text-slate-400">Install →</span>
                        )}
                      </div>
                    </motion.button>
                  )
                })}
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 text-center mb-4 px-2"
                >
                  {error}
                </motion.p>
              )}

              <p className="text-xs dark:text-brand-muted text-slate-400 text-center leading-relaxed">
                By connecting you agree to the{' '}
                <a href="#" className="text-brand-cyan hover:underline">Terms of Service</a>.
                We never store your private key.
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

/* ── Inline SVG icons ──────────────────────────────────────── */

function MetaMaskIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 35 33" fill="none">
      <path d="M32.958 1L19.565 10.82l2.424-5.72L32.958 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.042 1l13.274 9.907-2.302-5.807L2.042 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M28.226 23.533l-3.562 5.456 7.622 2.098 2.187-7.41-6.247-.144z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.527 23.677l2.174 7.41 7.609-2.098-3.549-5.456-6.234.144z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.957 14.564l-2.122 3.205 7.558.345-.253-8.12-5.183 4.57z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24.043 14.564l-5.256-4.664-.172 8.214 7.558-.345-2.13-3.205z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.31 28.989l4.552-2.2-3.93-3.066-.622 5.266z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.138 26.789l4.564 2.2-.635-5.266-3.929 3.066z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PhantomIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
      <rect width="128" height="128" rx="24" fill="#AB9FF2"/>
      <path d="M110.584 64.9142H99.142C99.142 41.8335 80.173 23 56.9337 23C34.1479 23 15.4479 41.2291 14.7337 63.7777C13.9928 87.3198 34.0606 107 57.7272 107H63.1526C84.3449 107 110.584 89.9057 110.584 64.9142Z" fill="white"/>
      <path d="M77.5306 64.9595C77.5306 72.1473 71.6977 77.9802 64.5099 77.9802C57.3221 77.9802 51.4893 72.1473 51.4893 64.9595C51.4893 57.7717 57.3221 51.9389 64.5099 51.9389C71.6977 51.9389 77.5306 57.7717 77.5306 64.9595Z" fill="#AB9FF2"/>
      <path d="M96.2752 64.9595C96.2752 72.1473 90.4424 77.9802 83.2546 77.9802C76.0668 77.9802 70.2339 72.1473 70.2339 64.9595C70.2339 57.7717 76.0668 51.9389 83.2546 51.9389C90.4424 51.9389 96.2752 57.7717 96.2752 64.9595Z" fill="white"/>
    </svg>
  )
}

function XamanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 200 200" fill="none">
      <rect width="200" height="200" rx="40" fill="#0077FF"/>
      <path d="M40 160L80 100L40 40H70L100 85L130 40H160L120 100L160 160H130L100 115L70 160H40Z" fill="white"/>
    </svg>
  )
}
