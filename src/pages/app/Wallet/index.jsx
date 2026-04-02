import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import useAppStore from '@/store/useAppStore'
import { getTokenBalances, getSwapQuote, swapEthForUsdc } from '@/lib/contracts'
import XrplDashboard from './XrplDashboard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const ETH_FAUCETS = [
  { label: 'Sepolia ETH',   url: 'https://sepoliafaucet.com',  note: 'Gas fees'     },
  { label: 'USDC (Circle)', url: 'https://faucet.circle.com',  note: 'Creation fee' },
]

function BalanceCard({ symbol, icon, balance, usdRate, loading, decimals = 2 }) {
  const usdValue = balance != null && usdRate ? (balance * usdRate).toFixed(2) : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="flex-1 dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-bold dark:text-brand-muted text-slate-500 uppercase tracking-wider">{symbol}</span>
      </div>
      {loading ? (
        <div className="h-8 w-24 dark:bg-brand-mid bg-slate-100 rounded-xl animate-pulse" />
      ) : (
        <>
          <p className="text-2xl font-extrabold dark:text-white text-slate-900 leading-none">
            {balance != null ? Number(balance).toFixed(decimals) : '—'}
          </p>
          {usdValue && (
            <p className="text-xs dark:text-brand-muted text-slate-400 mt-1">${usdValue} USD</p>
          )}
        </>
      )}
    </motion.div>
  )
}


// ── Ethereum wallet view ──────────────────────────────────────

function EthWalletView({ wallet, env }) {
  const { t } = useTranslation()
  const [balances,     setBalances]     = useState(null)
  const [balLoading,   setBalLoading]   = useState(false)
  const [balError,     setBalError]     = useState(null)
  const [amountIn,     setAmountIn]     = useState('')
  const [quote,        setQuote]        = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [swapping,     setSwapping]     = useState(false)
  const [swapError,    setSwapError]    = useState(null)
  const [swapDone,     setSwapDone]     = useState(false)
  const [swapOut,      setSwapOut]      = useState(null)

  const loadBalances = useCallback(async () => {
    if (!wallet?.address) return
    setBalLoading(true)
    setBalError(null)
    try {
      const b = await getTokenBalances(env)
      setBalances(b)
    } catch (err) {
      setBalError(err?.message ?? 'Could not load balances.')
    } finally {
      setBalLoading(false)
    }
  }, [wallet?.address, env])

  useEffect(() => { loadBalances() }, [loadBalances])

  useEffect(() => {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) { setQuote(null); return }
    const t = setTimeout(async () => {
      setQuoteLoading(true)
      try { const q = await getSwapQuote(Number(amountIn), env); setQuote(q) }
      finally { setQuoteLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [amountIn, env])

  async function handleSwap() {
    setSwapping(true); setSwapError(null); setSwapDone(false)
    try {
      const result = await swapEthForUsdc(Number(amountIn), env)
      setSwapDone(true); setSwapOut(result.amountOut ?? null)
      setAmountIn(''); setQuote(null)
      await loadBalances()
    } catch (err) {
      const msg = err?.message ?? ''
      setSwapError(msg.startsWith('USDC_FAUCET:') ? msg.replace('USDC_FAUCET:', '') : msg)
    } finally { setSwapping(false) }
  }

  function setMax() {
    if (!balances?.eth) return
    setAmountIn(Math.max(0, balances.eth - 0.005).toFixed(6))
  }

  const ethIn          = Number(amountIn) || 0
  const hasEnoughEth   = balances?.eth != null && ethIn > 0 && ethIn <= balances.eth - 0.003
  const canSwap        = hasEnoughEth && !swapping && env === 'live'

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">{t('walletPage.title')}</h1>
          <p className="text-xs font-mono dark:text-brand-muted text-slate-400 mt-0.5">
            {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
            <span className="ml-2 dark:text-brand-cyan text-brand-blue">{wallet.chainName ?? wallet.chain}</span>
            {env === 'dev' && <span className="ml-1 text-amber-400">· {t('common.testnet')}</span>}
          </p>
        </div>
        <button onClick={loadBalances} disabled={balLoading}
          className="p-2 rounded-xl dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors dark:text-brand-muted text-slate-400 text-sm disabled:opacity-40">
          {balLoading ? '⟳' : '↻'}
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <BalanceCard symbol="ETH"  icon="🔷" balance={balances?.eth}  usdRate={quote?.rate ?? null} loading={balLoading} decimals={5} />
        <BalanceCard symbol="USDC" icon="💵" balance={balances?.usdc} usdRate={1}                  loading={balLoading} decimals={2} />
      </div>

      {balError && <p className="text-xs text-red-400 text-center mb-4">{balError}</p>}

      <Card hover={false} className="p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold dark:text-white text-slate-900">{t('walletPage.swap')}</h2>
          {env === 'dev' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
              {t('common.testnet')}
            </span>
          )}
        </div>

        <div className="dark:bg-brand-dark bg-slate-50 rounded-2xl p-4 mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs dark:text-brand-muted text-slate-400 font-semibold">{t('walletPage.youSend')}</span>
            <button onClick={setMax} className="text-xs text-brand-blue hover:underline font-semibold">
              {t('walletPage.max')} {balances?.eth != null ? `${Math.max(0, balances.eth - 0.005).toFixed(4)} ETH` : ''}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔷</span>
            <input type="number" min="0" step="0.001" placeholder="0.00" value={amountIn}
              onChange={e => setAmountIn(e.target.value)}
              className="flex-1 bg-transparent text-xl font-bold dark:text-white text-slate-900 outline-none placeholder:dark:text-brand-muted placeholder:text-slate-300 min-w-0" />
            <span className="text-sm font-bold dark:text-brand-muted text-slate-500">ETH</span>
          </div>
        </div>

        <div className="flex justify-center my-1">
          <div className="w-8 h-8 rounded-full dark:bg-brand-mid bg-slate-100 flex items-center justify-center text-sm dark:text-brand-muted text-slate-400">↓</div>
        </div>

        <div className="dark:bg-brand-dark bg-slate-50 rounded-2xl p-4 mb-4">
          <span className="text-xs dark:text-brand-muted text-slate-400 font-semibold block mb-1.5">{t('walletPage.youReceive')}</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl">💵</span>
            <div className="flex-1 text-xl font-bold dark:text-white text-slate-900">
              {quoteLoading ? <span className="dark:text-brand-muted text-slate-300 animate-pulse">…</span>
                : quote ? <>{quote.usdcOut.toFixed(2)}{quote.isEstimate && <span className="text-xs text-amber-400 ml-1">~est</span>}</>
                : <span className="dark:text-brand-muted text-slate-300">0.00</span>}
            </div>
            <span className="text-sm font-bold dark:text-brand-muted text-slate-500">USDC</span>
          </div>
        </div>

        {quote && (
          <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mb-4 px-1">
            <span>{t('walletPage.rate')}</span>
            <span>1 ETH ≈ ${quote.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC{quote.isEstimate && ' (estimated)'}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {swapDone ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-sm text-center">
              ✓ {t('walletPage.swapComplete')}{swapOut ? ` ~${swapOut.toFixed(2)} USDC received.` : ''}
            </motion.div>
          ) : (
            <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {env === 'dev' ? (
                <div className="py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-muted text-slate-400 text-sm text-center">
                  {t('walletPage.swapDisabled')}
                </div>
              ) : (
                <Button className="w-full" disabled={!canSwap || swapping} onClick={handleSwap}>
                  {swapping ? 'Swapping…' : !ethIn ? t('walletPage.enterAmount') : !hasEnoughEth ? t('walletPage.insufficient') : t('walletPage.swap')}
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {swapError && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 mt-3 text-center">
            {swapError}
          </motion.p>
        )}
      </Card>

      {env === 'dev' && (
        <Card hover={false} className="p-5">
          <h3 className="font-bold dark:text-white text-slate-900 mb-1 text-sm">{t('walletPage.faucets')}</h3>
          <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">{t('walletPage.faucetDesc')}</p>
          <div className="space-y-2">
            {ETH_FAUCETS.map(f => (
              <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-2xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 hover:border-brand-blue/40 transition-colors group">
                <div>
                  <p className="text-sm font-semibold dark:text-white text-slate-900 group-hover:text-brand-blue transition-colors">{t('walletPage.getToken', { label: f.label })}</p>
                  <p className="text-xs dark:text-brand-muted text-slate-400">{f.note}</p>
                </div>
                <span className="text-brand-blue text-sm">→</span>
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────

export default function WalletPage() {
  const navigate        = useNavigate()
  const { t }           = useTranslation()
  const { env, wallet } = useAppStore()

  if (!wallet) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-4">👛</p>
        <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">{t('walletPage.noWallet')}</h2>
        <p className="text-sm dark:text-brand-muted text-slate-500 mb-6">{t('walletPage.connectDesc')}</p>
        <Button onClick={() => navigate('/app')}>{t('walletPage.back')}</Button>
      </div>
    )
  }

  if (wallet.chain === 'XRPL') {
    return <XrplDashboard wallet={wallet} env={env} />
  }

  return <EthWalletView wallet={wallet} env={env} />
}
