import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetDisputes, adminUpdateDisputeStatus } from '@/lib/db'

const STATUS_COLORS   = { OPEN: 'red', REVIEWING: 'yellow', RESOLVED: 'green', CLOSED: 'muted' }
const PRIORITY_COLORS = { CRITICAL: 'red', HIGH: 'red', MEDIUM: 'yellow', LOW: 'muted' }
const stagger = { visible: { transition: { staggerChildren: 0.05 } } }
const row     = { hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }

function timeAgo(dateStr) {
  const h = Math.floor((Date.now() - new Date(dateStr).getTime()) / 36e5)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d ago` : `${h}h ago`
}

export default function AdminDisputes() {
  const [disputes,     setDisputes]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected,     setSelected]     = useState(null)

  useEffect(() => {
    adminGetDisputes().then(({ data }) => {
      setDisputes(data ?? [])
      setLoading(false)
    })
  }, [])

  async function handleStatusChange(dispute, status) {
    await adminUpdateDisputeStatus(dispute.id, status)
    setDisputes(prev => prev.map(d => d.id === dispute.id ? { ...d, status } : d))
    setSelected(prev => prev ? { ...prev, status } : null)
  }

  const filtered = disputes.filter(d => statusFilter === 'ALL' || d.status === statusFilter)
  const open     = disputes.filter(d => d.status === 'OPEN').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Disputes</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
          {loading ? '…' : `${disputes.length} total · ${open} open`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Open',      value: disputes.filter(d => d.status === 'OPEN').length,      color: 'text-red-400'     },
          { label: 'Reviewing', value: disputes.filter(d => d.status === 'REVIEWING').length, color: 'text-amber-400'   },
          { label: 'Resolved',  value: disputes.filter(d => d.status === 'RESOLVED').length,  color: 'text-emerald-400' },
          { label: 'Total',     value: disputes.length,                                        color: 'text-brand-cyan'  },
        ].map(s => (
          <Card key={s.label} hover={false} className="p-4">
            <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-xs dark:text-brand-muted text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {['ALL','OPEN','REVIEWING','RESOLVED','CLOSED'].map(opt => (
          <button key={opt} onClick={() => setStatusFilter(opt)}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${statusFilter === opt ? 'bg-gradient-brand text-white' : 'dark:bg-brand-mid bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-dark hover:bg-slate-200'}`}>
            {opt}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card hover={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-brand-border border-slate-200">
                {['Pod','Type','Reporter','Priority','Status','Opened','Amount',''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={stagger} initial="hidden" animate="visible">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
              ) : filtered.map(d => (
                <motion.tr key={d.id} variants={row} onClick={() => setSelected(d)}
                  className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-5 py-4 font-semibold dark:text-white text-slate-900">{d.pod?.name ?? '—'}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{d.type.replace('_', ' ')}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{d.reporter?.alias ?? d.reporter?.wallet_address?.slice(0,8) ?? '—'}</td>
                  <td className="px-5 py-4"><Badge variant={PRIORITY_COLORS[d.priority] ?? 'muted'}>{d.priority}</Badge></td>
                  <td className="px-5 py-4"><Badge variant={STATUS_COLORS[d.status] ?? 'muted'}>{d.status}</Badge></td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{timeAgo(d.created_at)}</td>
                  <td className="px-5 py-4 font-bold dark:text-white text-slate-900">{d.amount_at_stake ? `$${d.amount_at_stake}` : '—'}</td>
                  <td className="px-5 py-4"><button className="text-xs text-brand-cyan hover:underline font-semibold">View →</button></td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center dark:text-brand-muted text-slate-400 py-12 text-sm">No disputes found.</p>
          )}
        </div>
      </Card>

      {selected && <DisputeDetail dispute={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />}
    </div>
  )
}

function DisputeDetail({ dispute: d, onClose, onStatusChange }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-xs dark:text-brand-muted text-slate-400 mb-1">{d.id}</p>
            <h2 className="text-xl font-extrabold dark:text-white text-slate-900">{d.pod?.name ?? 'Unknown Pod'}</h2>
          </div>
          <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            ['Type',        d.type.replace(/_/g, ' ')],
            ['Status',      d.status],
            ['Priority',    d.priority],
            ['Amount',      d.amount_at_stake ? `$${d.amount_at_stake}` : '—'],
            ['Reporter',    d.reporter?.alias ?? d.reporter?.wallet_address?.slice(0,10) ?? '—'],
            ['Respondent',  d.respondent?.alias ?? d.respondent?.wallet_address?.slice(0,10) ?? '—'],
            ['Opened',      new Date(d.created_at).toLocaleDateString()],
          ].map(([label, val]) => (
            <div key={label} className="dark:bg-brand-dark bg-slate-50 rounded-xl p-3">
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-1">{label}</p>
              <p className="font-semibold dark:text-white text-slate-900 text-sm">{val}</p>
            </div>
          ))}
        </div>

        {d.description && (
          <div className="mb-5 p-4 rounded-xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200">
            <p className="text-xs dark:text-brand-muted text-slate-400 mb-1 font-semibold uppercase tracking-wider">Description</p>
            <p className="text-sm dark:text-brand-text text-slate-700 leading-relaxed">{d.description}</p>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {d.status === 'OPEN' && (
            <button onClick={() => onStatusChange(d, 'REVIEWING')}
              className="flex-1 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/20 transition-colors">
              Mark Reviewing
            </button>
          )}
          {['OPEN','REVIEWING'].includes(d.status) && (
            <button onClick={() => onStatusChange(d, 'RESOLVED')}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/20 transition-colors">
              Resolve
            </button>
          )}
          {d.status === 'RESOLVED' && (
            <button onClick={() => onStatusChange(d, 'CLOSED')}
              className="flex-1 py-2.5 rounded-xl dark:bg-brand-mid bg-slate-100 dark:text-brand-text text-slate-700 text-sm font-semibold hover:opacity-80 transition-opacity">
              Close
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
