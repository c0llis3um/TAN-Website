/**
 * XrplDashboard — rich XRPL wallet view
 *
 * Shows: live XRP price + sparkline, KPI cards, recent transactions from ledger
 * Price data: CoinGecko public API (no key needed)
 * Tx data:    xrpl.js account_tx
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Client, xrpToDrops } from 'xrpl'
import MoonPayButton from '@/components/MoonPayButton'
import Card from '@/components/ui/Card'

const NODES = {
  dev:  'wss://s.devnet.rippletest.net:51233',
  live: 'wss://xrplcluster.com',
}

const PERIODS = [
  { label: '1H',    days: 0.042 },
  { label: '24H',   days: 1     },
  { label: '7D',    days: 7     },
  { label: '30D',   days: 30    },
  { label: '1Y',    days: 365   },
]

// ── CoinGecko price fetch ─────────────────────────────────────

async function fetchXrpPrice() {
  try {
    const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd&include_24hr_change=true')
    const json = await res.json()
    return { price: json.ripple?.usd ?? 0, change24h: json.ripple?.usd_24h_change ?? 0 }
  } catch {
    return { price: 0, change24h: 0 }
  }
}

async function fetchPriceChart(days) {
  try {
    const res  = await fetch(`https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=${days}`)
    const json = await res.json()
    return (json.prices ?? []).map(([ts, price]) => ({ ts, price: +price.toFixed(4) }))
  } catch {
    return []
  }
}

// ── XRPL account data ─────────────────────────────────────────

async function fetchAccountData(address, env) {
  const client = new Client(NODES[env] ?? NODES.dev)
  await client.connect()

  let xrpBalance  = 0
  let rlusdBalance = 0
  let transactions = []
  let totalReceived = 0
  let txCount = 0

  try {
    const info = await client.request({
      command:      'account_info',
      account:      address,
      ledger_index: 'validated',
    })
    xrpBalance = Math.max(0, (Number(info.result.account_data.Balance) / 1_000_000) - 10)
  } catch { /* unfunded */ }

  try {
    const txResp = await client.request({
      command:  'account_tx',
      account:  address,
      limit:    20,
    })
    transactions = (txResp.result.transactions ?? []).map(({ tx, meta }) => {
      const type      = tx.TransactionType
      const isPayment = type === 'Payment'
      const incoming  = isPayment && tx.Destination === address
      const outgoing  = isPayment && tx.Account === address

      let amount = 0
      if (isPayment) {
        if (typeof tx.Amount === 'string') {
          amount = Number(tx.Amount) / 1_000_000
        } else {
          amount = Number(tx.Amount?.value ?? 0)
        }
      }

      if (incoming) totalReceived += amount
      txCount++

      return {
        hash:     tx.hash,
        type,
        incoming,
        outgoing,
        amount,
        token:    typeof tx.Amount === 'object' ? (tx.Amount?.currency ?? 'XRP') : 'XRP',
        date:     tx.date ? new Date((tx.date + 946684800) * 1000) : null,
        fee:      tx.Fee ? Number(tx.Fee) / 1_000_000 : 0,
        result:   meta?.TransactionResult ?? '—',
      }
    })
  } catch { /* no tx history */ }

  await client.disconnect()
  return { xrpBalance, rlusdBalance, transactions, totalReceived, txCount }
}

// ── Sub-components ────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false, loading }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border flex flex-col gap-1 ${
        accent
          ? 'dark:bg-brand-blue/10 bg-blue-50 dark:border-brand-blue/30 border-blue-200'
          : 'dark:bg-brand-dark bg-slate-50 dark:border-brand-border border-slate-200'
      }`}>
      <p className="text-xs font-semibold dark:text-brand-muted text-slate-500 uppercase tracking-wider">{label}</p>
      {loading
        ? <div className="h-6 w-20 dark:bg-brand-mid bg-slate-200 rounded animate-pulse" />
        : <p className={`text-lg font-extrabold ${accent ? 'gradient-text' : 'dark:text-white text-slate-900'}`}>{value}</p>
      }
      {sub && <p className="text-[11px] dark:text-brand-muted text-slate-400">{sub}</p>}
    </motion.div>
  )
}

function TxRow({ tx, address }) {
  const isIn     = tx.incoming
  const isOut    = tx.outgoing
  const isOther  = !isIn && !isOut
  const success  = tx.result === 'tesSUCCESS'

  const typeLabel = {
    Payment:         isIn ? 'Received' : isOut ? 'Sent' : 'Payment',
    OfferCreate:     'DEX Offer',
    OfferDelete:     'Offer Cancel',
    TrustSet:        'Trust Line',
    AccountSet:      'Account Set',
    EscrowCreate:    'Escrow In',
    EscrowFinish:    'Escrow Out',
  }[tx.type] ?? tx.type

  const color = !success ? 'text-red-400' : isIn ? 'text-emerald-400' : isOut ? 'text-brand-cyan' : 'dark:text-brand-muted text-slate-400'
  const arrow = isIn ? '↙' : isOut ? '↗' : '↔'

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-4 py-3 border-b dark:border-brand-border/30 border-slate-100 last:border-0 hover:dark:bg-brand-mid/30 hover:bg-slate-50 transition-colors">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0
        ${isIn ? 'dark:bg-emerald-500/15 bg-emerald-50 text-emerald-400'
               : isOut ? 'dark:bg-brand-blue/15 bg-blue-50 text-brand-cyan'
               : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-400'}`}>
        {arrow}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${color}`}>{typeLabel}</span>
          {!success && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">failed</span>}
        </div>
        <p className="text-[11px] font-mono dark:text-brand-muted text-slate-400 truncate">
          {tx.hash ? `${tx.hash.slice(0, 10)}…${tx.hash.slice(-6)}` : '—'}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        {tx.amount > 0 && (
          <p className={`text-sm font-bold ${color}`}>
            {isIn ? '+' : isOut ? '-' : ''}{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tx.token}
          </p>
        )}
        <p className="text-[11px] dark:text-brand-muted text-slate-400">
          {tx.date ? tx.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
        </p>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function XrplDashboard({ wallet, env }) {
  const [accountData,  setAccountData]  = useState(null)
  const [acctLoading,  setAcctLoading]  = useState(true)
  const [priceData,    setPriceData]    = useState({ price: 0, change24h: 0 })
  const [chartData,    setChartData]    = useState([])
  const [chartLoading, setChartLoading] = useState(true)
  const [period,       setPeriod]       = useState('24H')
  const [txPage,       setTxPage]       = useState(0)

  const TX_PAGE_SIZE = 8

  const loadAccount = useCallback(async () => {
    if (!wallet?.address) return
    setAcctLoading(true)
    try {
      const data = await fetchAccountData(wallet.address, env)
      setAccountData(data)
    } catch { /* ignore */ }
    setAcctLoading(false)
  }, [wallet?.address, env])

  const loadChart = useCallback(async (p) => {
    setChartLoading(true)
    const days = PERIODS.find(x => x.label === p)?.days ?? 1
    const data = await fetchPriceChart(days)
    setChartData(data)
    setChartLoading(false)
  }, [])

  useEffect(() => {
    fetchXrpPrice().then(setPriceData)
    loadAccount()
  }, [loadAccount])

  useEffect(() => { loadChart(period) }, [period, loadChart])

  const { xrpBalance = 0, rlusdBalance = 0, transactions = [], totalReceived = 0, txCount = 0 } = accountData ?? {}
  const usdValue    = (xrpBalance * priceData.price).toFixed(2)
  const change24h   = priceData.change24h
  const isPositive  = change24h >= 0

  const txSlice     = transactions.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE)
  const totalPages  = Math.ceil(transactions.length / TX_PAGE_SIZE)

  // Chart color based on period trend
  const chartStart  = chartData[0]?.price ?? 0
  const chartEnd    = chartData[chartData.length - 1]?.price ?? 0
  const chartUp     = chartEnd >= chartStart
  const chartColor  = chartUp ? '#34d399' : '#f87171'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">XRP Wallet</h1>
          <p className="text-xs font-mono dark:text-brand-muted text-slate-400 mt-0.5">
            {wallet.address.slice(0, 10)}…{wallet.address.slice(-8)}
            {env === 'dev' && <span className="ml-2 text-amber-400">· Devnet</span>}
          </p>
        </div>
        <button onClick={loadAccount} disabled={acctLoading}
          className="p-2.5 rounded-xl dark:hover:bg-brand-mid hover:bg-slate-100 transition-colors dark:text-brand-muted text-slate-400 disabled:opacity-40 text-lg">
          {acctLoading ? '⟳' : '↻'}
        </button>
      </div>

      {/* Hero — total USD value */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-gradient-to-br from-[#1e3a5f] to-[#0f172a] border dark:border-brand-border/50 border-slate-200 p-6 relative overflow-hidden">
        {/* background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-brand-blue/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Portfolio Value</p>
        {acctLoading
          ? <div className="h-10 w-40 bg-white/10 rounded-xl animate-pulse mb-2" />
          : <p className="text-4xl font-extrabold text-white mb-1">${usdValue}</p>
        }
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-300">
            {acctLoading ? '…' : `${xrpBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP`}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {isPositive ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}% 24h
          </span>
          <span className="text-sm text-slate-300">
            1 XRP = ${priceData.price.toFixed(4)}
          </span>
        </div>
      </motion.div>

      {/* Price chart */}
      <Card hover={false} className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold dark:text-white text-slate-900 text-sm">XRP / USD</h3>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button key={p.label} onClick={() => setPeriod(p.label)}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  period === p.label
                    ? 'bg-gradient-brand text-white'
                    : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-200'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {chartLoading ? (
          <div className="h-32 dark:bg-brand-dark bg-slate-50 rounded-xl animate-pulse" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="xrpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="dark:bg-brand-darker bg-white border dark:border-brand-border border-slate-200 rounded-xl px-3 py-2 text-xs shadow-lg">
                      <p className="font-bold dark:text-white text-slate-900">${payload[0].value}</p>
                      <p className="dark:text-brand-muted text-slate-400">
                        {new Date(payload[0].payload.ts).toLocaleString()}
                      </p>
                    </div>
                  )
                }}
              />
              <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2}
                fill="url(#xrpGrad)" dot={false} activeDot={{ r: 4, fill: chartColor }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="h-32 flex items-center justify-center text-xs dark:text-brand-muted text-slate-400">
            Chart unavailable
          </p>
        )}
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="XRP Balance"    value={`${xrpBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP`} accent loading={acctLoading} />
        <KpiCard label="XRP Price"      value={`$${priceData.price.toFixed(4)}`}   sub={`${isPositive ? '+' : ''}${change24h.toFixed(2)}% today`} loading={false} />
        <KpiCard label="USD Value"      value={`$${usdValue}`}                     loading={acctLoading} />
        <KpiCard label="RLUSD Balance"  value={rlusdBalance > 0 ? `${rlusdBalance.toFixed(2)} RLUSD` : '—'} loading={acctLoading} />
        <KpiCard label="Total Received" value={`${totalReceived.toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP`} loading={acctLoading} />
        <KpiCard label="Transactions"   value={txCount > 0 ? txCount.toString() : '—'} sub="last 20 fetched" loading={acctLoading} />
      </div>

      {/* Buy XRP */}
      <Card hover={false} className="p-5">
        <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-1">Buy XRP</h3>
        <p className="text-xs dark:text-brand-muted text-slate-400 mb-4">
          Apple Pay · Google Pay · Credit Card — no exchange needed
        </p>
        <MoonPayButton walletAddress={wallet.address} token="XRP" env={env} />
      </Card>

      {/* Transactions */}
      <Card hover={false} className="overflow-hidden">
        <div className="px-5 py-4 border-b dark:border-brand-border border-slate-200 flex items-center justify-between">
          <h3 className="font-bold dark:text-white text-slate-900 text-sm">Recent Transactions</h3>
          {!acctLoading && txCount > 0 && (
            <span className="text-xs dark:text-brand-muted text-slate-400">{transactions.length} loaded</span>
          )}
        </div>

        {acctLoading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-xl dark:bg-brand-dark bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 dark:bg-brand-dark bg-slate-100 rounded animate-pulse w-24" />
                  <div className="h-2.5 dark:bg-brand-dark bg-slate-100 rounded animate-pulse w-40" />
                </div>
                <div className="h-4 dark:bg-brand-dark bg-slate-100 rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-center text-sm dark:text-brand-muted text-slate-400 py-10">No transactions found</p>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div key={txPage} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {txSlice.map(tx => (
                  <TxRow key={tx.hash ?? Math.random()} tx={tx} address={wallet.address} />
                ))}
              </motion.div>
            </AnimatePresence>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t dark:border-brand-border border-slate-100">
                <button onClick={() => setTxPage(p => Math.max(0, p - 1))} disabled={txPage === 0}
                  className="text-xs px-3 py-1.5 rounded-lg dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 disabled:opacity-40 font-semibold transition-all hover:border-brand-blue/30">
                  ← Prev
                </button>
                <span className="text-xs dark:text-brand-muted text-slate-400">
                  {txPage + 1} / {totalPages}
                </span>
                <button onClick={() => setTxPage(p => Math.min(totalPages - 1, p + 1))} disabled={txPage === totalPages - 1}
                  className="text-xs px-3 py-1.5 rounded-lg dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 disabled:opacity-40 font-semibold">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Devnet faucet */}
      {env === 'dev' && (
        <Card hover={false} className="p-5">
          <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-1">XRPL Devnet Faucet</h3>
          <p className="text-xs dark:text-brand-muted text-slate-400 mb-3">Free test XRP — funded instantly.</p>
          <a href="https://faucet.devnet.rippletest.net/accounts" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-2xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 hover:border-brand-blue/40 transition-colors group">
            <div>
              <p className="text-sm font-semibold dark:text-white text-slate-900 group-hover:text-brand-blue transition-colors">Get Devnet XRP</p>
              <p className="text-xs dark:text-brand-muted text-slate-400">Paste your address and hit fund</p>
            </div>
            <span className="text-brand-blue text-sm">→</span>
          </a>
        </Card>
      )}
    </div>
  )
}
