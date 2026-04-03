import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAllPods, updatePodStatus, adminForceAdvanceCycle } from '@/lib/db'
import { releaseCollateral } from '@/lib/contracts'
import useAppStore from '@/store/useAppStore'

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
  const memberCount = pod.pod_members?.length ?? 0
  const organizer   = pod.organizer?.alias ?? pod.organizer?.wallet_address ?? '—'
  const env         = useAppStore(s => s.env)

  const [releasing,     setReleasing]     = useState(false)
  const [releaseTx,     setReleaseTx]     = useState(null)
  const [releaseErr,    setReleaseErr]    = useState(null)
  const [completing,    setCompleting]    = useState(false)
  const [currentStatus, setCurrentStatus] = useState(pod.status)
  const [advancing,     setAdvancing]     = useState(false)
  const [advanceResult, setAdvanceResult] = useState(null)
  const [advanceErr,    setAdvanceErr]    = useState(null)

  // Full member detail (payout_slot, payments for current cycle)
  const [members,      setMembers]      = useState([])
  const [cyclePayments,setCyclePayments] = useState([])   // payments for current_cycle
  const [loadingDetail,setLoadingDetail] = useState(pod.status === 'ACTIVE')
  const [slashingId,   setSlashingId]   = useState(null) // user_id being slashed
  const [slashResults, setSlashResults] = useState({})   // user_id → { txHash, err }

  // Compute whether current cycle is overdue
  const cycleMs   = (pod.cycle_frequency_days ?? 7) * (pod.env === 'dev' ? 36e5 : 864e5)
  const cycleDue  = pod.cycle_started_at ? new Date(pod.cycle_started_at).getTime() + cycleMs : null
  const isOverdue = cycleDue ? Date.now() > cycleDue : false

  useEffect(() => {
    if (pod.status !== 'ACTIVE') { setLoadingDetail(false); return }
    // Fetch full member detail + current-cycle payments
    Promise.all([
      import('@/lib/supabase').then(m => m.default
        .from('pod_members')
        .select('id, user_id, payout_slot, status, user:users(id, alias, wallet_address)')
        .eq('pod_id', pod.id)
        .order('payout_slot')),
      import('@/lib/supabase').then(m => m.default
        .from('payments')
        .select('user_id, method, status, tx_hash')
        .eq('pod_id', pod.id)
        .eq('cycle', pod.current_cycle ?? 0)),
    ]).then(([{ data: mems }, { data: pays }]) => {
      setMembers(mems ?? [])
      setCyclePayments(pays ?? [])
      setLoadingDetail(false)
    })
  }, [pod.id, pod.status, pod.current_cycle])

  const canForceComplete = pod.chain === 'XRPL' && currentStatus === 'ACTIVE' && pod.contract_address
  const canReleaseEVM    = pod.chain === 'Ethereum' && currentStatus === 'COMPLETED' && pod.contract_address
  const canReleaseXRPL   = pod.chain === 'XRPL'    && currentStatus === 'COMPLETED' && pod.contract_address
  const canRelease       = canReleaseEVM || canReleaseXRPL

  const xrplBase = (pod.env ?? 'dev') === 'live'
    ? 'https://xrpl.org/transactions/'
    : 'https://devnet.xrpl.org/transactions/'

  async function handleForceComplete() {
    if (!window.confirm('Mark pod as COMPLETED? This will enable collateral release.')) return
    setCompleting(true)
    try {
      await updatePodStatus(pod.id, 'COMPLETED')
      setCurrentStatus('COMPLETED')
    } catch (e) {
      alert(e?.message ?? 'Failed to complete pod')
    } finally {
      setCompleting(false)
    }
  }

  async function handleRelease() {
    if (!window.confirm('Release collateral back to all members? This cannot be undone.')) return
    setReleasing(true)
    setReleaseErr(null)
    try {
      if (canReleaseEVM) {
        const { txHash } = await releaseCollateral(env, pod.contract_address)
        setReleaseTx(txHash)
      } else if (canReleaseXRPL) {
        const supabaseModule = await import('@/lib/supabase')
        const { data: { session } } = await supabaseModule.default.auth.getSession()
        const res = await fetch('/.netlify/functions/release-xrpl-collateral', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
          body:    JSON.stringify({ podId: pod.id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Release failed')
        setReleaseTx(json.results?.filter(r => r.status === 'ok').map(r => r.txHash).join(',') || 'done')
      }
    } catch (e) {
      setReleaseErr(e?.reason ?? e?.message ?? String(e))
    } finally {
      setReleasing(false)
    }
  }

  async function handleSlash(member) {
    if (!window.confirm(`Slash collateral for ${member.user?.alias ?? member.user?.wallet_address}? Their collateral will cover this cycle's payout.`)) return
    setSlashingId(member.user_id)
    try {
      const supabaseModule = await import('@/lib/supabase')
      const { data: { session } } = await supabaseModule.default.auth.getSession()
      const res = await fetch('/.netlify/functions/slash-xrpl-collateral', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body:    JSON.stringify({ podId: pod.id, memberUserId: member.user_id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Slash failed')
      setSlashResults(prev => ({ ...prev, [member.user_id]: { txHash: json.txHash } }))
      // Refresh cycle payments
      const supabase = supabaseModule.default
      const { data: pays } = await supabase
        .from('payments')
        .select('user_id, method, status, tx_hash')
        .eq('pod_id', pod.id)
        .eq('cycle', pod.current_cycle ?? 0)
      setCyclePayments(pays ?? [])
    } catch (e) {
      setSlashResults(prev => ({ ...prev, [member.user_id]: { err: e?.message ?? String(e) } }))
    } finally {
      setSlashingId(null)
    }
  }

  async function handleForceAdvance() {
    if (!window.confirm(`Force-advance cycle ${pod.current_cycle}? Any unpaid members will be marked DEFAULTED.`)) return
    setAdvancing(true)
    setAdvanceErr(null)
    setAdvanceResult(null)
    const { data, error } = await adminForceAdvanceCycle(pod.id)
    if (error) {
      setAdvanceErr(typeof error === 'string' ? error : error.message)
    } else {
      setAdvanceResult(data)
      setCurrentStatus(data.status)
      // Refresh member/payment detail
      const supabase = (await import('@/lib/supabase')).default
      const [{ data: mems }, { data: pays }] = await Promise.all([
        supabase.from('pod_members').select('id, user_id, payout_slot, status, user:users(id, alias, wallet_address)').eq('pod_id', pod.id).order('payout_slot'),
        supabase.from('payments').select('user_id, method, status, tx_hash').eq('pod_id', pod.id).eq('cycle', pod.current_cycle ?? 0),
      ])
      setMembers(mems ?? [])
      setCyclePayments(pays ?? [])
    }
    setAdvancing(false)
  }

  // Per-member payment status helpers
  function getMemberPayStatus(userId) {
    const pays = cyclePayments.filter(p => p.user_id === userId)
    if (pays.some(p => p.method === 'collateral_slash')) return 'slashed'
    if (pays.some(p => ['CONFIRMED','PENDING'].includes(p.status) && p.method !== 'collateral_slash')) return 'paid'
    return 'unpaid'
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-xs dark:text-brand-muted text-slate-400 mb-1">{pod.id}</p>
            <h2 className="text-xl font-extrabold dark:text-white text-slate-900">{pod.name}</h2>
          </div>
          <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 transition-colors leading-none">×</button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            ['Chain',        pod.chain],
            ['Token',        pod.token],
            ['Status',       currentStatus],
            ['Members',      `${memberCount} / ${pod.size}`],
            ['Total Pot',    `${pod.contribution_amount * pod.size} ${pod.token}`],
            ['Contribution', `${pod.contribution_amount} ${pod.token}/wk`],
            ['Cycle',        pod.current_cycle ? `${pod.current_cycle} / ${pod.total_cycles}` : '—'],
            ['Fee Paid',     pod.creation_fee_paid ? 'Yes' : 'No'],
            ['Created',      new Date(pod.created_at).toLocaleDateString()],
            ['Organizer',    organizer],
          ].map(([label, val]) => (
            <div key={label} className="dark:bg-brand-dark bg-slate-50 rounded-xl p-3">
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">{label}</p>
              <p className="font-semibold dark:text-white text-slate-900 text-sm truncate">{val}</p>
            </div>
          ))}
        </div>

        {pod.contract_address && (
          <div className="mb-4 p-3 rounded-xl dark:bg-brand-dark bg-slate-50">
            <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">Escrow / Contract</p>
            <p className="font-mono text-xs dark:text-brand-cyan text-brand-blue break-all">{pod.contract_address}</p>
          </div>
        )}

        {/* ── Member payment status (ACTIVE pods) ── */}
        {currentStatus === 'ACTIVE' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold dark:text-brand-muted text-slate-500 uppercase tracking-wider">
                Cycle {pod.current_cycle} Members
              </p>
              {cycleDue && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isOverdue
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {isOverdue ? 'OVERDUE' : `Due ${new Date(cycleDue).toLocaleString()}`}
                </span>
              )}
            </div>

            {loadingDetail ? (
              <p className="text-xs dark:text-brand-muted text-slate-400 py-3 text-center">Loading members…</p>
            ) : (
              <div className="space-y-2">
                {members.map(m => {
                  const payStatus  = getMemberPayStatus(m.user_id)
                  const isRecipient = m.payout_slot === pod.current_cycle
                  const slashResult = slashResults[m.user_id]
                  const canSlash   = pod.chain === 'XRPL' && isOverdue && payStatus === 'unpaid' && m.status !== 'DEFAULTED'

                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl dark:bg-brand-dark bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold dark:text-white text-slate-900 truncate">
                            {m.user?.alias ?? m.user?.wallet_address?.slice(0,14) ?? '—'}
                          </p>
                          {isRecipient && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-brand-blue/20 text-brand-blue font-bold">PAYOUT RECIPIENT</span>
                          )}
                          {m.status === 'DEFAULTED' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">DEFAULTED</span>
                          )}
                        </div>
                        <p className="text-xs dark:text-brand-muted text-slate-400 font-mono truncate">
                          Slot {m.payout_slot} · {m.user?.wallet_address?.slice(0,16)}…
                        </p>
                        {slashResult?.txHash && (
                          <a href={`${xrplBase}${slashResult.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-emerald-400 underline font-mono">
                            Slashed → tx {slashResult.txHash.slice(0,12)}…
                          </a>
                        )}
                        {slashResult?.err && (
                          <p className="text-xs text-red-400 mt-1 break-all">{slashResult.err}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          payStatus === 'paid'    ? 'bg-emerald-500/20 text-emerald-400' :
                          payStatus === 'slashed' ? 'bg-orange-500/20 text-orange-400' :
                                                    'bg-red-500/20 text-red-400'
                        }`}>
                          {payStatus === 'paid' ? '✓ PAID' : payStatus === 'slashed' ? '⚡ SLASHED' : '✗ UNPAID'}
                        </span>
                        {canSlash && (
                          <button onClick={() => handleSlash(m)} disabled={slashingId === m.user_id}
                            className="text-xs px-2 py-1 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-bold transition-colors whitespace-nowrap">
                            {slashingId === m.user_id ? '…' : 'Slash'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Force Advance Cycle */}
        {currentStatus === 'ACTIVE' && isOverdue && (
          <div className="mt-4 p-4 rounded-xl border dark:border-orange-500/30 border-orange-300 dark:bg-orange-500/10 bg-orange-50">
            <p className="text-xs dark:text-orange-300 text-orange-700 font-semibold mb-1">Force Advance Cycle (any chain)</p>
            <p className="text-xs dark:text-orange-200/70 text-orange-600 mb-3">
              Mark all unpaid members as DEFAULTED and advance to the next cycle. Use when a member forgot to pay and the tanda is stuck.
            </p>
            {advanceErr && (
              <p className="text-xs text-red-400 mb-2 break-all">{advanceErr}</p>
            )}
            {advanceResult && (
              <p className="text-xs text-emerald-400 mb-2 font-semibold">
                {advanceResult.status === 'COMPLETED' ? 'Pod completed!' : `Advanced to cycle ${advanceResult.current_cycle}`}
              </p>
            )}
            <button onClick={handleForceAdvance} disabled={advancing}
              className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm transition-colors">
              {advancing ? 'Advancing…' : `Force Advance → Cycle ${(pod.current_cycle ?? 0) + 1}`}
            </button>
          </div>
        )}

        {/* Force Complete */}
        {canForceComplete && (
          <div className="mt-4 p-4 rounded-xl border dark:border-blue-500/30 border-blue-300 dark:bg-blue-500/10 bg-blue-50">
            <p className="text-xs dark:text-blue-300 text-blue-700 font-semibold mb-1">Force Complete (XRPL)</p>
            <p className="text-xs dark:text-blue-200/70 text-blue-600 mb-3">
              Mark this pod as completed to enable collateral release back to members.
            </p>
            <button onClick={handleForceComplete} disabled={completing}
              className="w-full py-2 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold text-sm transition-colors">
              {completing ? 'Completing…' : 'Mark as Completed →'}
            </button>
          </div>
        )}

        {/* Collateral Release */}
        {canRelease && !releaseTx && (
          <div className="mt-4 p-4 rounded-xl border dark:border-amber-500/30 border-amber-300 dark:bg-amber-500/10 bg-amber-50">
            <p className="text-xs dark:text-amber-300 text-amber-700 font-semibold mb-1">
              Collateral Release · {pod.chain}
            </p>
            <p className="text-xs dark:text-amber-200/70 text-amber-600 mb-3">
              {canReleaseXRPL
                ? 'All cycles complete. The escrow wallet will send each member\'s collateral deposit directly on XRPL.'
                : 'All cycles complete. Connect MetaMask as the factory owner, then release collateral on-chain.'}
            </p>
            {releaseErr && (
              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs font-bold text-red-400 mb-1">Error</p>
                <pre className="text-xs text-red-300 whitespace-pre-wrap break-all select-all">{releaseErr}</pre>
              </div>
            )}
            <button onClick={handleRelease} disabled={releasing}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold text-sm transition-colors">
              {releasing ? 'Releasing…' : `Release Collateral · ${pod.chain}`}
            </button>
          </div>
        )}

        {/* Release success */}
        {releaseTx && (
          <div className="mt-4 p-4 rounded-xl dark:bg-emerald-500/10 bg-emerald-50 border dark:border-emerald-500/30 border-emerald-300">
            <p className="text-xs font-bold dark:text-emerald-300 text-emerald-700 mb-2">Collateral Released ✓</p>
            {pod.chain === 'XRPL'
              ? releaseTx.split(',').map(h => h.trim()).filter(Boolean).map(hash => (
                  <a key={hash} href={`${xrplBase}${hash}`} target="_blank" rel="noopener noreferrer"
                    className="block font-mono text-xs dark:text-brand-cyan text-brand-blue underline break-all mb-1">
                    {hash}
                  </a>
                ))
              : (
                <a href={`https://sepolia.etherscan.io/tx/${releaseTx}`} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs dark:text-brand-cyan text-brand-blue underline break-all">{releaseTx}</a>
              )
            }
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
