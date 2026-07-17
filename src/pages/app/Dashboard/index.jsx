import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import KpiCard from '@/components/ui/KpiCard'
import useAppStore from '@/store/useAppStore'
import { getUser, getOrganizerPods, getMemberPods, getOpenPods, getUserContributionTotals } from '@/lib/db'
import { getXrplBalances } from '@/lib/xrpl'
import { isPushSupported, enablePushNotifications } from '@/lib/push'
import { IconBadge, IconPlus, IconSearch, IconWallet, IconCard, IconBell, IconBolt } from '@/components/ui/Icons'

const stagger = { visible: { transition: { staggerChildren: 0.08 } } }
const item    = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }

const STATUS_VARIANT = { OPEN: 'blue', LOCKED: 'yellow', ACTIVE: 'green',  COMPLETED: 'muted',     CANCELLED: 'red', EXPIRED: 'red' }
const CLAIMABLE_STATUSES = ['EXPIRED', 'CANCELLED']

// Formats a { XRP: 4, RLUSD: 2 } style totals object for display — tokens
// are never summed together, just joined as separate amounts.
function formatTokenTotals(totals) {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => v > 0)
  if (entries.length === 0) return null
  return entries.map(([token, amount]) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token}`).join(', ')
}

export default function Dashboard() {
  const { t }             = useTranslation()
  const navigate          = useNavigate()
  const { wallet, env }   = useAppStore()

  const STATUS_LABEL = {
    OPEN: t('dashboard.statusOpen'), LOCKED: t('dashboard.statusLocked'),
    ACTIVE: t('dashboard.statusActive'), COMPLETED: t('dashboard.statusCompleted'),
    CANCELLED: t('dashboard.statusCancelled'), EXPIRED: t('dashboard.statusExpired'),
  }
  const QUICK = [
    { label: t('dashboard.createPod'), Icon: IconPlus,   to: '/app/create', highlight: true,  disabled: false },
    { label: t('dashboard.browsePods'), Icon: IconSearch, to: '/app/pods',  highlight: false, disabled: false },
    { label: t('walletPage.title'),     Icon: IconWallet, to: '/app/wallet',highlight: false, disabled: false },
    { label: t('dashboard.buyUsdc'),    Icon: IconCard,   to: null,         highlight: false, disabled: true  },
  ]

  const [user,        setUser]        = useState(null)
  const [pods,        setPods]        = useState([])
  const [joinedPods,  setJoinedPods]  = useState([])
  const [loading,     setLoading]     = useState(false)
  const [publicPods,     setPublicPods]     = useState([])
  const [publicLoading,  setPublicLoading]  = useState(false)
  const [tvl,            setTvl]            = useState(null)

  const [notifPrompt,   setNotifPrompt]   = useState(false)
  const [notifDismissed,setNotifDismissed]= useState(false)
  const [notifBusy,     setNotifBusy]     = useState(false)
  const [notifErr,      setNotifErr]      = useState(null)

  const [balance,        setBalance]        = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [contribTotals,  setContribTotals]  = useState(null)
  const [contribLoading, setContribLoading] = useState(false)

  useEffect(() => {
    if (isPushSupported() && Notification.permission === 'default') setNotifPrompt(true)
  }, [])

  async function handleEnableNotifications() {
    if (!user?.id) return
    setNotifBusy(true)
    setNotifErr(null)
    const { ok, reason } = await enablePushNotifications(user.id)
    setNotifBusy(false)
    if (ok) setNotifPrompt(false)
    else setNotifErr(reason === 'denied' ? t('dashboard.notifDenied') : t('dashboard.notifError'))
  }

  useEffect(() => {
    if (!wallet?.address) return
    setLoading(true)

    getUser(wallet.address).then(({ data: u }) => {
      if (!u) { setLoading(false); return }
      setUser(u)
      Promise.all([
        getOrganizerPods(u.id),
        getMemberPods(u.id),
      ]).then(([{ data: created }, { data: joined }]) => {
        setPods(created ?? [])
        setJoinedPods(joined ?? [])
        setLoading(false)
      })
    })
  }, [wallet?.address])

  // No wallet connected — show real, live tandas from across the platform
  // instead of an empty personal state, so a first-time visitor sees an
  // active platform rather than a blank page before they've connected.
  useEffect(() => {
    if (wallet?.address) return
    setPublicLoading(true)
    getOpenPods().then(({ data }) => {
      setPublicPods(data ?? [])
      setPublicLoading(false)
    })
  }, [wallet?.address])

  const activePods = pods.filter(p => ['OPEN', 'LOCKED', 'ACTIVE'].includes(p.status))
  const duePod     = activePods.find(p => p.status === 'ACTIVE')

  const displayPods    = wallet ? activePods : publicPods
  const displayLoading = wallet ? loading    : publicLoading

  // Platform-wide, not personal — fetched once regardless of wallet
  // connection. Verified against real escrow balances server-side rather
  // than summed from the DB, so it can't drift from what's actually locked.
  useEffect(() => {
    fetch('/.netlify/functions/get-tvl')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setTvl(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!wallet?.address || wallet.chain !== 'XRPL') return
    setBalanceLoading(true)
    getXrplBalances(wallet.address, env)
      .then(setBalance)
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false))
  }, [wallet?.address, wallet?.chain, env])

  useEffect(() => {
    if (!user?.id) return
    setContribLoading(true)
    getUserContributionTotals(user.id).then(({ data }) => {
      setContribTotals(data)
      setContribLoading(false)
    })
  }, [user?.id])

  // Client-side, from state Dashboard already fetches — no extra query.
  // Approximates by pod status rather than the member's own status, so a
  // defaulted member's already-slashed collateral can be over-counted in
  // an edge case; fine for a glance-value KPI, not a ledger. Grouped by
  // token, same as contribTotals — XRP and RLUSD are never summed together.
  const totalLocked = [...pods, ...joinedPods]
    .filter(p => p.status === 'ACTIVE')
    .reduce((totals, p) => {
      totals[p.token] = (totals[p.token] ?? 0) + p.contribution_amount * 2
      return totals
    }, {})

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">
          {t('dashboard.greeting')}
        </h1>
        {wallet ? (
          <p className="dark:text-brand-muted text-slate-500 text-sm mt-1 font-mono">
            {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
            {' · '}<span className="text-brand-cyan">{wallet.chainName ?? wallet.chain}{env === 'dev' ? ' Testnet' : ''}</span>
          </p>
        ) : (
          <p className="text-sm text-amber-400 mt-1">{t('dashboard.noWallet')}</p>
        )}
      </motion.div>

      {/* Enable push notifications */}
      {notifPrompt && !notifDismissed && user && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap dark:bg-brand-blue/5 bg-blue-50 border dark:border-brand-blue/20 border-blue-200">
          <div className="flex items-center gap-3">
            <IconBadge size="sm"><IconBell /></IconBadge>
            <div>
              <p className="font-bold dark:text-white text-slate-900 text-sm">{t('dashboard.notifTitle')}</p>
              <p className="text-xs dark:text-brand-muted text-slate-500">{t('dashboard.notifBody')}</p>
              {notifErr && <p className="text-xs text-red-400 mt-1">{notifErr}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setNotifDismissed(true)}
              className="text-xs px-3 py-2 rounded-xl dark:text-brand-muted text-slate-500 hover:opacity-70 transition-opacity">
              {t('dashboard.notifNotNow')}
            </button>
            <Button size="sm" onClick={handleEnableNotifications} disabled={notifBusy}>
              {notifBusy ? '…' : t('dashboard.notifEnable')}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Payment due banner */}
      {duePod && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="mb-6 p-4 rounded-2xl flex items-center justify-between gap-4 bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-3">
            <IconBolt className="w-6 h-6 text-amber-500 animate-pulse" />
            <div>
              <p className="font-bold dark:text-white text-slate-900 text-sm">{t('dashboard.activePod', { name: duePod.name })}</p>
              <p className="text-xs dark:text-brand-muted text-slate-500">
                {duePod.contribution_amount} {duePod.token} · {t('dashboard.cycle', { n: duePod.current_cycle, total: duePod.total_cycles })}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate(`/app/pod/${duePod.id}/pay`)}>{t('dashboard.payNow')}</Button>
        </motion.div>
      )}

      {/* KPI strip */}
      <motion.div variants={stagger} initial="hidden" animate="visible"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {wallet && (
          <>
            <motion.div variants={item}>
              <KpiCard accent label={t('dashboard.kpiBalance')}
                value={balance ? formatTokenTotals({ XRP: balance.xrp, RLUSD: balance.rlusd }) ?? '0 XRP' : '—'}
                loading={balanceLoading} />
            </motion.div>
            <motion.div variants={item}>
              <KpiCard label={t('dashboard.reputation')} value={user ? `${user.reputation_score} / 100` : '—'} loading={loading} />
            </motion.div>
            <motion.div variants={item}>
              <KpiCard label={t('dashboard.kpiLocked')} value={formatTokenTotals(totalLocked) ?? `0 ${wallet.chainName ?? 'XRP'}`} loading={loading} />
            </motion.div>
            <motion.div variants={item}>
              <KpiCard label={t('dashboard.kpiContributed')} value={formatTokenTotals(contribTotals) ?? '0 XRP'} loading={contribLoading} />
            </motion.div>
          </>
        )}
        {tvl && tvl.podCount > 0 && (
          <motion.div variants={item}>
            <KpiCard label={t('dashboard.tvlTitle')} value={`${tvl.totalXrp.toFixed(2)} XRP`} sub={t('dashboard.tvlSub', { n: tvl.podCount })} />
          </motion.div>
        )}
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Active pods (or, if not connected, a live feed of real platform activity) */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">
              {t(wallet ? 'dashboard.activePods' : 'dashboard.liveOnPlatform')}
            </h2>

            {displayLoading ? (
              <div className="space-y-3">
                {[1,2].map(i => (
                  <div key={i} className="h-24 rounded-2xl dark:bg-brand-mid bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : displayPods.length === 0 ? (
              <Card hover={false} className="p-5 text-center">
                <p className="font-bold dark:text-white text-slate-900 mb-1">{t('dashboard.noActivePods')}</p>
                <p className="text-sm dark:text-brand-muted text-slate-400 mb-4">{t('dashboard.noActiveDesc')}</p>
                <div className="flex gap-3 justify-center">
                  <Button size="sm" onClick={() => navigate('/app/create')}>{t('dashboard.createPod')}</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate('/app/pods')}>{t('dashboard.browsePods')}</Button>
                </div>
              </Card>
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
                {displayPods.map(pod => {
                  const pct     = pod.total_cycles > 0 ? Math.round((pod.current_cycle / pod.total_cycles) * 100) : 0
                  const members = pod.pod_members?.length ?? 0
                  return (
                    <motion.div key={pod.id} variants={item}>
                      <Card className="p-5" onClick={() => navigate(`/app/pod/${pod.id}`)}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold dark:text-white text-slate-900">{pod.name}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs dark:text-brand-muted text-slate-400">{pod.chain} · {pod.token}</span>
                              <span className="text-xs dark:text-brand-muted text-slate-400">·</span>
                              <span className="text-xs dark:text-brand-muted text-slate-400">{pod.contribution_amount} {pod.token}{t('dashboard.perCycle')}</span>
                              <span className="text-xs dark:text-brand-muted text-slate-400">· {t('dashboard.memberCount', { n: members, total: pod.size })}</span>
                            </div>
                          </div>
                          <Badge variant={STATUS_VARIANT[pod.status] ?? 'muted'}>
                            {STATUS_LABEL[pod.status] ?? pod.status}
                          </Badge>
                        </div>
                        <div className="mb-1">
                          <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mb-1">
                            <span>{t('dashboard.cycle', { n: pod.current_cycle, total: pod.total_cycles })}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 dark:bg-brand-border/50 bg-slate-200 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-gradient-brand rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </div>

          {/* Joined tandas */}
          {!loading && joinedPods.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">{t('dashboard.joined')}</h2>
              <Card hover={false} className="divide-y dark:divide-brand-border divide-slate-100">
                {joinedPods.map(pod => (
                  <div key={pod.id}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:dark:bg-brand-mid hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/app/pod/${pod.id}`)}>
                    <div>
                      <p className="text-sm font-semibold dark:text-white text-slate-900">{pod.name}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400">{pod.chain} · {pod.token} · {pod.contribution_amount} {pod.token}{t('dashboard.perCycle')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={STATUS_VARIANT[pod.status] ?? 'muted'}>{STATUS_LABEL[pod.status] ?? pod.status}</Badge>
                      {CLAIMABLE_STATUSES.includes(pod.status) && (
                        <span className="text-[10px] text-emerald-400 font-semibold">{t('dashboard.claimAvailable')} →</span>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* Past tandas */}
          {!loading && pods.filter(p => !['OPEN','LOCKED','ACTIVE'].includes(p.status)).length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">{t('dashboard.past')}</h2>
              <Card hover={false} className="divide-y dark:divide-brand-border divide-slate-100">
                {pods.filter(p => !['OPEN','LOCKED','ACTIVE'].includes(p.status)).map(pod => (
                  <div key={pod.id}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:dark:bg-brand-mid hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/app/pod/${pod.id}`)}>
                    <div>
                      <p className="text-sm font-semibold dark:text-white text-slate-900">{pod.name}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400">{pod.chain} · {pod.token}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={STATUS_VARIANT[pod.status] ?? 'muted'}>{STATUS_LABEL[pod.status] ?? pod.status}</Badge>
                      {CLAIMABLE_STATUSES.includes(pod.status) && (
                        <span className="text-[10px] text-emerald-400 font-semibold">{t('dashboard.claimAvailable')} →</span>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Pod Status Donut */}
          <Card hover={false} className="p-5">
            <p className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-4">{t('dashboard.myPodsTitle')}</p>
            {pods.length > 0 ? (() => {
              const openCount      = pods.filter(p => p.status === 'OPEN').length
              const activeCount    = pods.filter(p => p.status === 'ACTIVE').length
              const completedCount = pods.filter(p => ['COMPLETED','DEFAULTED','CANCELLED','EXPIRED'].includes(p.status)).length
              const slices = [
                { name: t('dashboard.statusOpen'),      value: openCount,      color: '#f59e0b' },
                { name: t('dashboard.statusActive'),    value: activeCount,    color: '#006aff' },
                { name: t('dashboard.statusCompleted'), value: completedCount, color: '#22c55e' },
              ].filter(s => s.value > 0)
              const display = slices.length > 0 ? slices : [{ name: '—', value: 1, color: '#1a3d52' }]
              return (
                <>
                  <div className="flex items-center gap-4">
                    <PieChart width={90} height={90}>
                      <Pie data={display} cx={40} cy={40} innerRadius={26} outerRadius={42} dataKey="value" strokeWidth={0}>
                        {display.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0d2a3a', border: '1px solid #1a3d52', borderRadius: 8, fontSize: 11 }}
                        itemStyle={{ color: '#a0c4d8' }} labelStyle={{ color: '#fff', fontWeight: 700 }}
                        formatter={(v, name) => [`${v} pod${v !== 1 ? 's' : ''}`, name]}
                      />
                    </PieChart>
                    <div className="space-y-2 flex-1">
                      {[
                        { label: t('dashboard.statusOpen'),      value: openCount,      color: '#f59e0b' },
                        { label: t('dashboard.statusActive'),    value: activeCount,    color: '#006aff' },
                        { label: t('dashboard.statusCompleted'), value: completedCount, color: '#22c55e' },
                      ].map(s => (
                        <div key={s.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                            <span className="dark:text-brand-text text-slate-600">{s.label}</span>
                          </div>
                          <span className="font-bold dark:text-white text-slate-900 text-sm">{s.value}</span>
                        </div>
                      ))}
                      <div className="pt-1.5 border-t dark:border-brand-border/40 border-slate-100 flex justify-between text-xs dark:text-brand-muted text-slate-400">
                        <span>{t('dashboard.total')}</span>
                        <span className="font-bold dark:text-white text-slate-700">{pods.length}</span>
                      </div>
                    </div>
                  </div>
                </>
              )
            })() : (
              <p className="text-sm dark:text-brand-muted text-slate-400 text-center py-4">{t('dashboard.noPods')}</p>
            )}
          </Card>

          {/* Quick actions */}
          <Card hover={false} className="p-4">
            <p className="text-xs font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">{t('dashboard.quickActions')}</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK.map(({ label, Icon, to, highlight, disabled }) => (
                <motion.button key={label}
                  onClick={() => !disabled && to && navigate(to)}
                  whileHover={disabled ? {} : { scale: 1.04, y: -1 }}
                  whileTap={disabled ? {} : { scale: 0.96 }}
                  disabled={disabled}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-semibold transition-all
                    ${disabled
                      ? 'dark:bg-brand-dark/50 bg-slate-50 dark:text-brand-muted/50 text-slate-400 dark:border-brand-border/50 border border-slate-200 opacity-50 cursor-not-allowed'
                      : highlight
                        ? 'bg-gradient-brand text-white shadow-glow-sm'
                        : 'dark:bg-brand-dark bg-slate-50 dark:text-brand-text text-slate-600 dark:hover:bg-brand-border hover:bg-slate-100 dark:border-brand-border border border-slate-200'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                  {disabled && <span className="text-[9px] uppercase tracking-wider opacity-70">{t('common.soon')}</span>}
                </motion.button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

