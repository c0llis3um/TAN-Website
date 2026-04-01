import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import useAppStore from '@/store/useAppStore'
import { getOpenPods } from '@/lib/db'

const CHAIN_VARIANT = { XRPL: 'blue', Ethereum: 'muted' }

const stagger = { visible: { transition: { staggerChildren: 0.07 } } }
const item    = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function BrowsePods() {
  const navigate          = useNavigate()
  const { env }           = useAppStore()
  const [chainFilter, setChainFilter] = useState('ALL')
  const [search,      setSearch]      = useState('')
  const [joining,     setJoining]     = useState(null)

  const [pods,    setPods]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true)
    getOpenPods().then(({ data, error: err }) => {
      if (err) setError(err.message)
      else setPods(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = pods.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchChain  = chainFilter === 'ALL' || p.chain === chainFilter
    return matchSearch && matchChain
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.button onClick={() => navigate('/app')} whileHover={{ x: -3 }}
        className="text-sm dark:text-brand-muted text-slate-400 hover:text-brand-cyan mb-6 flex items-center gap-1">
        ← Back
      </motion.button>

      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Open Tandas</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-1">
          Join a community savings group that needs members.
          {env === 'dev' && <span className="ml-2 text-amber-400">(Testnet)</span>}
        </p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="flex-1 min-w-[180px] px-4 py-2 rounded-xl text-sm dark:bg-brand-mid bg-white dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60"
        />
        <div className="flex gap-1.5">
          {['ALL','XRPL','Ethereum'].map(opt => (
            <button key={opt} onClick={() => setChainFilter(opt)}
              className={`text-xs px-3 py-2 rounded-xl font-semibold transition-all ${
                chainFilter === opt
                  ? 'bg-gradient-brand text-white'
                  : 'dark:bg-brand-mid bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-dark hover:bg-slate-200'
              }`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="h-52 rounded-2xl dark:bg-brand-mid bg-slate-100 animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
      )}

      {/* Pod grid */}
      {!loading && !error && (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(pod => {
            const members   = pod.pod_members?.length ?? 0
            const spotsLeft = pod.size - members
            const pct       = pod.size > 0 ? Math.round((members / pod.size) * 100) : 0
            const organizer = pod.organizer?.alias ?? pod.organizer?.wallet_address?.slice(0, 8) ?? '—'

            return (
              <motion.div key={pod.id} variants={item}>
                <Card hover className="p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold dark:text-white text-slate-900">{pod.name}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">by {organizer}</p>
                    </div>
                    <Badge variant={CHAIN_VARIANT[pod.chain] ?? 'muted'}>{pod.chain}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="dark:bg-brand-dark bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="font-extrabold dark:text-white text-slate-900">{pod.contribution_amount}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400">/week {pod.token}</p>
                    </div>
                    <div className="dark:bg-brand-dark bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="font-extrabold text-brand-cyan">{pod.contribution_amount * pod.size}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400">total pot</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs dark:text-brand-muted text-slate-400 mb-1.5">
                      <span>{members}/{pod.size} members</span>
                      <span className="text-emerald-400 font-semibold">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                    </div>
                    <div className="h-1.5 dark:bg-brand-border/50 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div className="h-full bg-gradient-brand rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                      />
                    </div>
                  </div>

                  <p className="text-xs dark:text-brand-muted text-slate-400">
                    Upfront: <span className="font-bold dark:text-white text-slate-900">
                      {pod.contribution_amount * 3} {pod.token}
                    </span>
                    <span className="ml-1 opacity-60">(2× collateral + 1st payment)</span>
                  </p>

                  <Button size="sm" className="w-full justify-center" onClick={() => setJoining(pod)}>
                    Join This Tanda →
                  </Button>
                </Card>
              </motion.div>
            )
          })}

          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16">
              <p className="text-3xl mb-3">🔍</p>
              <p className="dark:text-brand-muted text-slate-400 mb-4">No open tandas found.</p>
              <Button size="sm" onClick={() => navigate('/app/create')}>Create One →</Button>
            </div>
          )}
        </motion.div>
      )}

      {joining && (
        <JoinModal pod={joining} onClose={() => setJoining(null)}
          onJoin={() => { setJoining(null); navigate(`/app/pod/${joining.id}`) }} />
      )}
    </div>
  )
}

function JoinModal({ pod, onClose, onJoin }) {
  const members = pod.pod_members?.length ?? 0
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow"
      >
        <h2 className="text-xl font-extrabold dark:text-white text-slate-900 mb-1">Join {pod.name}?</h2>
        <p className="text-sm dark:text-brand-muted text-slate-500 mb-6">{pod.chain} · {pod.token}</p>

        <div className="space-y-3 mb-6">
          {[
            ['Weekly contribution', `${pod.contribution_amount} ${pod.token}`],
            ['Collateral (2×)',     `${pod.contribution_amount * 2} ${pod.token} (returned at end)`],
            ['First payment',      `${pod.contribution_amount} ${pod.token}`],
            ['Total upfront',      `${pod.contribution_amount * 3} ${pod.token}`],
            ['Total pot',          `${pod.contribution_amount * pod.size} ${pod.token}`],
            ['Duration',           `${pod.size} weeks`],
            ['Spots left',         `${pod.size - members} of ${pod.size}`],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm border-b dark:border-brand-border/30 border-slate-100 last:border-0 pb-2.5 last:pb-0">
              <span className="dark:text-brand-muted text-slate-500">{l}</span>
              <span className="font-semibold dark:text-white text-slate-900 text-right">{v}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 text-sm font-semibold hover:opacity-80">
            Cancel
          </button>
          <button onClick={onJoin}
            className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold shadow-glow-sm hover:shadow-glow transition-all">
            See Pod & Join →
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
