import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAllPods } from '@/lib/db'
import { releaseCollateral } from '@/lib/contracts'
import { useAppStore } from '@/store'

const STATUS_COLORS = { ACTIVE: 'green', COMPLETED: 'blue', DEFAULTED: 'red', OPEN: 'yellow', LOCKED: 'yellow', CANCELLED: 'muted' }
const CHAIN_COLORS  = { XRPL: 'blue', Solana: 'muted', Ethereum: 'muted' }

const stagger = { visible: { transition: { staggerChildren: 0.05 } } }
const row     = { hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 36e5), d = Math.floor(diff / 864e5)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

export default function AdminPods() {
  const [pods,         setPods]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [chainFilter,  setChainFilter]  = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected,     setSelected]     = useState(null)

  useEffect(() => {
    adminGetAllPods().then(({ data }) => {
      setPods(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = pods.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
    const matchChain  = chainFilter  === 'ALL' || p.chain  === chainFilter
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter
    return matchSearch && matchChain && matchStatus
  })

  const activePods = pods.filter(p => p.status === 'ACTIVE').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Pods</h1>
          <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
            {loading ? '…' : `${pods.length} total · ${activePods} active`}
          </p>
        </div>
      </div>

      <Card hover={false} className="p-4">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60"
          />
          <FilterChips label="Chain"  value={chainFilter}  onChange={setChainFilter}  options={['ALL','XRPL','Solana','Ethereum']} />
          <FilterChips label="Status" value={statusFilter} onChange={setStatusFilter} options={['ALL','OPEN','ACTIVE','LOCKED','COMPLETED','DEFAULTED']} />
        </div>
      </Card>

      <Card hover={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-brand-border border-slate-200">
                {['Name','Chain','Token','Status','Members','Pot','Fee Paid','Organizer','Created',''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={stagger} initial="hidden" animate="visible">
              {loading ? (
                <tr><td colSpan={10} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
              ) : filtered.map(pod => {
                const members  = pod.pod_members?.length ?? 0
                const organizer = pod.organizer?.alias ?? pod.organizer?.wallet_address?.slice(0,10) ?? '—'
                const pot      = pod.contribution_amount * pod.size
                return (
                  <motion.tr key={pod.id} variants={row} onClick={() => setSelected(pod)}
                    className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-5 py-4 font-semibold dark:text-white text-slate-900 whitespace-nowrap">{pod.name}</td>
                    <td className="px-5 py-4"><Badge variant={CHAIN_COLORS[pod.chain] ?? 'muted'}>{pod.chain}</Badge></td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{pod.token}</td>
                    <td className="px-5 py-4"><Badge variant={STATUS_COLORS[pod.status] ?? 'muted'}>{pod.status}</Badge></td>
                    <td className="px-5 py-4 dark:text-brand-text text-slate-700">{members}/{pod.size}</td>
                    <td className="px-5 py-4 font-bold dark:text-white text-slate-900">{pot} {pod.token}</td>
                    <td className="px-5 py-4 text-center">{pod.creation_fee_paid ? <span className="text-emerald-400 font-bold">✓</span> : <span className="dark:text-brand-muted text-slate-300">—</span>}</td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 truncate max-w-[160px]">{organizer}</td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{timeAgo(pod.created_at)}</td>
                    <td className="px-5 py-4">
                      <button className="text-xs text-brand-cyan hover:underline font-semibold whitespace-nowrap">Details →</button>
                    </td>
                  </motion.tr>
                )
              })}
            </motion.tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center dark:text-brand-muted text-slate-400 py-12 text-sm">No pods match your filters.</p>
          )}
        </div>
      </Card>

      {selected && <PodDetail pod={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function PodDetail({ pod, onClose }) {
  const members   = pod.pod_members?.length ?? 0
  const organizer = pod.organizer?.alias ?? pod.organizer?.wallet_address ?? '—'
  const env       = useAppStore(s => s.env)

  const [releasing, setReleasing] = useState(false)
  const [releaseTx, setReleaseTx] = useState(null)
  const [releaseErr, setReleaseErr] = useState(null)

  const canRelease = pod.chain === 'Ethereum' && pod.status === 'COMPLETED' && pod.contract_address

  async function handleRelease() {
    if (!window.confirm('This will call forceComplete() on the TandaPod contract and return all collateral to members. Continue?')) return
    setReleasing(true)
    setReleaseErr(null)
    try {
      const { txHash } = await releaseCollateral(env, pod.contract_address)
      setReleaseTx(txHash)
    } catch (e) {
      setReleaseErr(e?.reason ?? e?.message ?? String(e))
    } finally {
      setReleasing(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-xs dark:text-brand-muted text-slate-400 mb-1">{pod.id}</p>
            <h2 className="text-xl font-extrabold dark:text-white text-slate-900">{pod.name}</h2>
          </div>
          <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            ['Chain',       pod.chain],
            ['Token',       pod.token],
            ['Status',      pod.status],
            ['Members',     `${members} / ${pod.size}`],
            ['Total Pot',   `${pod.contribution_amount * pod.size} ${pod.token}`],
            ['Contribution',`${pod.contribution_amount} ${pod.token}/wk`],
            ['Payout',      pod.payout_method],
            ['Fee Paid',    pod.creation_fee_paid ? 'Yes' : 'No'],
            ['Created',     new Date(pod.created_at).toLocaleDateString()],
            ['Organizer',   organizer],
          ].map(([label, val]) => (
            <div key={label} className="dark:bg-brand-dark bg-slate-50 rounded-xl p-3">
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">{label}</p>
              <p className="font-semibold dark:text-white text-slate-900 text-sm truncate">{val}</p>
            </div>
          ))}
        </div>
        {pod.contract_address && (
          <div className="mb-4 p-3 rounded-xl dark:bg-brand-dark bg-slate-50">
            <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">Contract Address</p>
            <p className="font-mono text-xs dark:text-brand-cyan text-brand-blue break-all">{pod.contract_address}</p>
          </div>
        )}

        {canRelease && !releaseTx && (
          <div className="mt-4 p-4 rounded-xl border dark:border-amber-500/30 border-amber-300 dark:bg-amber-500/10 bg-amber-50">
            <p className="text-xs dark:text-amber-300 text-amber-700 font-semibold mb-1">Collateral Release</p>
            <p className="text-xs dark:text-amber-200/70 text-amber-600 mb-3">
              All cycles complete. Connect MetaMask as the factory owner, then release collateral back to members on-chain.
            </p>
            {releaseErr && <p className="text-xs text-red-400 mb-2">{releaseErr}</p>}
            <button onClick={handleRelease} disabled={releasing}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold text-sm transition-colors">
              {releasing ? 'Releasing…' : 'Release Collateral On-Chain'}
            </button>
          </div>
        )}

        {releaseTx && (
          <div className="mt-4 p-4 rounded-xl dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/30 border-emerald-300">
            <p className="text-xs font-bold dark:text-emerald-300 text-emerald-700 mb-1">Collateral Released</p>
            <a href={`https://sepolia.etherscan.io/tx/${releaseTx}`} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs dark:text-brand-cyan text-brand-blue underline break-all">{releaseTx}</a>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function FilterChips({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs dark:text-brand-muted text-slate-400 font-semibold mr-1">{label}:</span>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
            value === opt
              ? 'bg-gradient-brand text-white'
              : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-200'
          }`}>{opt}</button>
      ))}
    </div>
  )
}
