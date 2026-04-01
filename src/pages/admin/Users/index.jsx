import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAllUsers, adminUpdateUserStatus } from '@/lib/db'

const STATUS_COLORS = { ACTIVE: 'green', FLAGGED: 'yellow', SUSPENDED: 'red' }
const stagger = { visible: { transition: { staggerChildren: 0.05 } } }
const row     = { hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }

export default function AdminUsers() {
  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected,     setSelected]     = useState(null)

  useEffect(() => {
    adminGetAllUsers().then(({ data }) => {
      setUsers(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = users.filter(u => {
    const matchSearch = (u.alias ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      u.wallet_address.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter
    return matchSearch && matchStatus
  })

  async function handleStatusChange(user, status) {
    await adminUpdateUserStatus(user.id, status)
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status } : u))
    setSelected(prev => prev ? { ...prev, status } : null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Users</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
          {loading ? '…' : `${users.length} registered · ${users.filter(u => u.status === 'ACTIVE').length} active`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users',  value: users.length,                                     color: 'text-brand-cyan'   },
          { label: 'KYC Verified', value: users.filter(u => u.kyc_verified).length,          color: 'text-emerald-400'  },
          { label: 'Flagged',      value: users.filter(u => u.status === 'FLAGGED').length,  color: 'text-amber-400'    },
          { label: 'Suspended',    value: users.filter(u => u.status === 'SUSPENDED').length,color: 'text-red-400'      },
        ].map(s => (
          <Card key={s.label} hover={false} className="p-4">
            <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-xs dark:text-brand-muted text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card hover={false} className="p-4">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by alias, email, or wallet…"
            className="flex-1 min-w-[220px] px-4 py-2 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs dark:text-brand-muted text-slate-400 font-semibold mr-1">Status:</span>
            {['ALL','ACTIVE','FLAGGED','SUSPENDED'].map(opt => (
              <button key={opt} onClick={() => setStatusFilter(opt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  statusFilter === opt ? 'bg-gradient-brand text-white' : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-200'}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card hover={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-brand-border border-slate-200">
                {['User','Wallet','Chain','Score','KYC','Status','Joined',''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={stagger} initial="hidden" animate="visible">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
              ) : filtered.map(user => {
                const initials = (user.alias ?? user.wallet_address ?? '?')[0].toUpperCase()
                const short    = `${user.wallet_address.slice(0,6)}…${user.wallet_address.slice(-4)}`
                return (
                  <motion.tr key={user.id} variants={row} onClick={() => setSelected(user)}
                    className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {initials}
                        </div>
                        <span className="font-semibold dark:text-white text-slate-900">{user.alias ?? short}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs dark:text-brand-muted text-slate-400">{short}</td>
                    <td className="px-5 py-4"><Badge variant={user.chain === 'XRPL' ? 'blue' : 'muted'}>{user.chain}</Badge></td>
                    <td className="px-5 py-4"><ScorePill score={user.reputation_score} /></td>
                    <td className="px-5 py-4 text-center">{user.kyc_verified ? <span className="text-emerald-400 font-bold">✓</span> : <span className="dark:text-brand-muted text-slate-300">—</span>}</td>
                    <td className="px-5 py-4"><Badge variant={STATUS_COLORS[user.status] ?? 'muted'}>{user.status}</Badge></td>
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4"><button className="text-xs text-brand-cyan hover:underline font-semibold whitespace-nowrap">View →</button></td>
                  </motion.tr>
                )
              })}
            </motion.tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center dark:text-brand-muted text-slate-400 py-12 text-sm">No users match your filters.</p>
          )}
        </div>
      </Card>

      {selected && <UserDetail user={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />}
    </div>
  )
}

function ScorePill({ score }) {
  const color = score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-brand-cyan' : score >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-bold text-sm ${color}`}>{score}</span>
}

function UserDetail({ user, onClose, onStatusChange }) {
  const initials = (user.alias ?? user.wallet_address ?? '?')[0].toUpperCase()
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md dark:bg-brand-darker bg-white rounded-3xl border dark:border-brand-border border-slate-200 p-8 shadow-glow">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-brand flex items-center justify-center text-white text-xl font-bold">
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-extrabold dark:text-white text-slate-900">{user.alias ?? 'No alias'}</h2>
              <p className="text-xs font-mono dark:text-brand-muted text-slate-400">{user.wallet_address.slice(0,12)}…</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl dark:text-brand-muted text-slate-400 hover:text-red-400 leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            ['Chain',  user.chain],
            ['Score',  user.reputation_score],
            ['KYC',    user.kyc_verified ? 'Verified' : 'Pending'],
            ['Status', user.status],
            ['Lang',   user.lang?.toUpperCase() ?? '—'],
            ['Joined', new Date(user.created_at).toLocaleDateString()],
          ].map(([label, val]) => (
            <div key={label} className="dark:bg-brand-dark bg-slate-50 rounded-xl p-3">
              <p className="text-xs dark:text-brand-muted text-slate-400 mb-0.5">{label}</p>
              <p className="font-semibold dark:text-white text-slate-900 text-sm">{val}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {user.status === 'ACTIVE' && (
            <button onClick={() => onStatusChange(user, 'FLAGGED')}
              className="flex-1 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/20 transition-colors">
              Flag User
            </button>
          )}
          {user.status !== 'SUSPENDED' && (
            <button onClick={() => onStatusChange(user, 'SUSPENDED')}
              className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/20 transition-colors">
              Suspend
            </button>
          )}
          {user.status === 'SUSPENDED' && (
            <button onClick={() => onStatusChange(user, 'ACTIVE')}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/20 transition-colors">
              Reinstate
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
