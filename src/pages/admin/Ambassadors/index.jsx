import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAmbassadors } from '@/lib/db'

const TIER_COLORS   = { Gold: 'yellow', Silver: 'muted', Bronze: 'muted' }
const STATUS_COLORS = { ACTIVE: 'green', PENDING: 'yellow', PAUSED: 'muted', REMOVED: 'red' }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }
const item    = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }

export default function AdminAmbassadors() {
  const [ambassadors, setAmbassadors] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    adminGetAmbassadors().then(({ data }) => {
      setAmbassadors(data ?? [])
      setLoading(false)
    })
  }, [])

  const active   = ambassadors.filter(a => a.status === 'ACTIVE')
  const pending  = ambassadors.filter(a => a.status === 'PENDING')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Ambassadors</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
          {loading ? '…' : `${active.length} active · ${pending.length} pending approval`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active',        value: active.length,                                       color: 'text-emerald-400' },
          { label: 'Pending',       value: pending.length,                                       color: 'text-amber-400'   },
          { label: 'Pods Created',  value: ambassadors.reduce((s, a) => s + (a.pods_created ?? 0), 0), color: 'text-brand-cyan' },
          { label: 'Members Onboarded', value: ambassadors.reduce((s, a) => s + (a.members_onboarded ?? 0), 0), color: 'text-brand-cyan' },
        ].map(s => (
          <Card key={s.label} hover={false} className="p-4">
            <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-xs dark:text-brand-muted text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">Pending Applications</h2>
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
            {pending.map(a => (
              <motion.div key={a.id} variants={item}>
                <Card hover={false} className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-bold dark:text-white text-slate-900">{a.user?.alias ?? a.user?.wallet_address?.slice(0,10) ?? '—'}</p>
                      <p className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">{a.user?.email ?? '—'} · {a.city ?? '—'}</p>
                      {a.statement && (
                        <p className="text-sm dark:text-brand-text text-slate-600 mt-2 max-w-xl">{a.statement}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/20 transition-colors">
                        Approve
                      </button>
                      <button className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/20 transition-colors">
                        Decline
                      </button>
                    </div>
                  </div>
                  <p className="text-xs dark:text-brand-muted text-slate-400 mt-2">Applied {new Date(a.created_at).toLocaleDateString()}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* Active ambassadors */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest dark:text-brand-muted text-slate-500 mb-3">Active Ambassadors</h2>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl dark:bg-brand-mid bg-slate-100 animate-pulse" />)}</div>
        ) : active.length === 0 ? (
          <Card hover={false} className="p-8 text-center">
            <p className="text-3xl mb-3">🤝</p>
            <p className="dark:text-brand-muted text-slate-400">No active ambassadors yet.</p>
          </Card>
        ) : (
          <Card hover={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-brand-border border-slate-200">
                    {['Ambassador','City','Tier','Pods','Members','Earned','Status','Since'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map(a => (
                    <tr key={a.id} className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold dark:text-white text-slate-900">{a.user?.alias ?? '—'}</p>
                          <p className="text-xs dark:text-brand-muted text-slate-400">{a.user?.email ?? '—'}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{a.city ?? '—'}</td>
                      <td className="px-5 py-4"><Badge variant={TIER_COLORS[a.tier] ?? 'muted'}>{a.tier}</Badge></td>
                      <td className="px-5 py-4 dark:text-brand-text text-slate-700">{a.pods_created}</td>
                      <td className="px-5 py-4 dark:text-brand-text text-slate-700">{a.members_onboarded}</td>
                      <td className="px-5 py-4 font-bold text-emerald-400">${Number(a.revenue_earned).toFixed(2)}</td>
                      <td className="px-5 py-4"><Badge variant={STATUS_COLORS[a.status] ?? 'muted'}>{a.status}</Badge></td>
                      <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
