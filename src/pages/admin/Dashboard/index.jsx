import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAllPods, adminGetAllUsers, adminGetDisputes } from '@/lib/db'

const stagger = { visible: { transition: { staggerChildren: 0.07 } } }
const item    = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }
const STATUS_COLORS = { ACTIVE: 'green', COMPLETED: 'blue', DEFAULTED: 'red', OPEN: 'yellow', LOCKED: 'yellow' }
const CHAIN_HEX  = { Solana: '#9945FF', Ethereum: '#627EEA', XRPL: '#006aff' }
const OPEN_STATUSES   = ['OPEN', 'LOCKED', 'ACTIVE']
const CLOSED_STATUSES = ['COMPLETED', 'DEFAULTED', 'CANCELLED']

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 36e5), d = Math.floor(diff / 864e5)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

export default function AdminDash() {
  const navigate = useNavigate()
  const [pods,   setPods]   = useState([])
  const [users,  setUsers]  = useState([])
  const [disputes, setDisputes] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([adminGetAllPods(), adminGetAllUsers(), adminGetDisputes()]).then(
      ([{ data: p }, { data: u }, { data: d }]) => {
        setPods(p ?? [])
        setUsers(u ?? [])
        setDisputes(d ?? [])
        setLoading(false)
      }
    )
  }, [])

  const activePods    = pods.filter(p => ['ACTIVE','LOCKED'].includes(p.status))
  const openDisputes  = disputes.filter(d => d.status === 'OPEN')
  const totalFees     = pods.filter(p => p.creation_fee_paid).length * 2  // $2 per pod

  // KPIs
  const kpis = [
    { label: 'Active Pods',   value: loading ? '…' : activePods.length,                      icon: '🏘️', color: 'blue'   },
    { label: 'Open Pods',     value: loading ? '…' : pods.filter(p => p.status === 'OPEN').length, icon: '📋', color: 'cyan'  },
    { label: 'Total Wallets', value: loading ? '…' : users.length,                            icon: '👥', color: 'blue'   },
    { label: 'Open Disputes', value: loading ? '…' : openDisputes.length,                     icon: '⚡', color: openDisputes.length > 0 ? 'yellow' : 'muted' },
    { label: 'Revenue (fees)',value: loading ? '…' : `$${totalFees}`,                         icon: '💰', color: 'green'  },
    { label: 'Total Pods',    value: loading ? '…' : pods.length,                             icon: '📊', color: 'muted'  },
  ]

  // Chain split from real pods
  const chainMap = {}
  pods.forEach(p => { chainMap[p.chain] = (chainMap[p.chain] ?? 0) + 1 })
  const chainSplit = Object.entries(chainMap).map(([name, value]) => ({ name, value, color: CHAIN_HEX[name] ?? '#888' }))

  // Pod status split — 3 slices
  const openCount      = pods.filter(p => p.status === 'OPEN').length
  const activeCount    = pods.filter(p => p.status === 'ACTIVE').length
  const completedCount = pods.filter(p => CLOSED_STATUSES.includes(p.status)).length
  const statusSlices   = [
    { name: 'Open',      value: openCount,      color: '#f59e0b' },
    { name: 'Active',    value: activeCount,    color: '#006aff' },
    { name: 'Completed', value: completedCount, color: '#22c55e' },
  ].filter(s => s.value > 0)

  // Pod creation by week (last 6 weeks)
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (5 - i) * 7)
    return { label: `W${i+1}`, start: new Date(d.getTime() - 7 * 864e5), end: d }
  })
  const podActivity = weeks.map(w => ({
    week: w.label,
    pods: pods.filter(p => { const t = new Date(p.created_at); return t >= w.start && t < w.end }).length,
    revenue: pods.filter(p => p.creation_fee_paid && new Date(p.created_at) >= w.start && new Date(p.created_at) < w.end).length * 2,
  }))

  // Alerts
  const alerts = []
  if (openDisputes.filter(d => d.priority === 'HIGH' || d.priority === 'CRITICAL').length > 0)
    alerts.push({ level: 'red',    icon: '🔴', msg: `${openDisputes.filter(d => d.priority === 'HIGH' || d.priority === 'CRITICAL').length} high-priority dispute(s) need attention`, to: '/admin/disputes' })
  if (openDisputes.length > 0)
    alerts.push({ level: 'yellow', icon: '🟡', msg: `${openDisputes.length} open dispute(s)`, to: '/admin/disputes' })
  if (alerts.length === 0)
    alerts.push({ level: 'blue', icon: '🔵', msg: 'No active alerts — platform healthy', to: null })

  const recentPods = pods.slice(0, 8)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Platform Dashboard</h1>
        <p className="dark:text-brand-muted text-slate-500 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* KPI grid */}
      <motion.div variants={stagger} initial="hidden" animate="visible"
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <motion.div key={kpi.label} variants={item}>
            <Card hover={false} className="p-5">
              <div className="text-2xl mb-3">{kpi.icon}</div>
              <div className="text-xl font-extrabold dark:text-white text-slate-900">{kpi.value}</div>
              <div className="text-xs dark:text-brand-muted text-slate-500 mt-1">{kpi.label}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts + alerts */}
      <div className="grid xl:grid-cols-3 gap-6">
        <motion.div className="xl:col-span-2"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card hover={false} className="p-6 h-full">
            <h3 className="font-bold dark:text-white text-slate-900 mb-6">Pod Creation & Revenue (last 6 weeks)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={podActivity}>
                <defs>
                  <linearGradient id="colorPods" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#006aff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#006aff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00c1ff" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00c1ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: '#0d2a3a', border: '1px solid #1a3d52', borderRadius: 12, fontSize: 12 }}
                  itemStyle={{ color: '#a0c4d8' }} labelStyle={{ color: '#fff', fontWeight: 700 }} />
                <Area type="monotone" dataKey="pods"    name="Pods"    stroke="#006aff" strokeWidth={2} fill="url(#colorPods)" />
                <Area type="monotone" dataKey="revenue" name="Rev ($)" stroke="#00c1ff" strokeWidth={2} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <div className="space-y-4">
          {/* Open vs Closed donut */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
            <Card hover={false} className="p-5">
              <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-4">Pod Status</h3>
              {pods.length > 0 ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <PieChart width={90} height={90}>
                      <Pie data={statusSlices.length > 0 ? statusSlices : [{ name: 'None', value: 1, color: '#1a3d52' }]}
                        cx={40} cy={40} innerRadius={26} outerRadius={42} dataKey="value" strokeWidth={0}>
                        {(statusSlices.length > 0 ? statusSlices : [{ color: '#1a3d52' }]).map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0d2a3a', border: '1px solid #1a3d52', borderRadius: 8, fontSize: 11 }}
                        itemStyle={{ color: '#a0c4d8' }} labelStyle={{ color: '#fff', fontWeight: 700 }}
                        formatter={(v, name) => [`${v} pod${v !== 1 ? 's' : ''}`, name]}
                      />
                    </PieChart>
                    <div className="space-y-2.5 flex-1">
                      {[
                        { label: 'Open',      value: openCount,      color: '#f59e0b' },
                        { label: 'Active',    value: activeCount,    color: '#006aff' },
                        { label: 'Completed', value: completedCount, color: '#22c55e' },
                      ].map(s => (
                        <div key={s.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                            <span className="dark:text-brand-text text-slate-600">{s.label}</span>
                          </div>
                          <span className="font-extrabold dark:text-white text-slate-900 text-sm">{s.value}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t dark:border-brand-border/40 border-slate-100 flex items-center justify-between text-xs dark:text-brand-muted text-slate-400">
                        <span>Total</span>
                        <span className="font-bold dark:text-white text-slate-700">{pods.length}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full dark:bg-brand-border/40 bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: pods.length > 0 ? `${Math.round((activeCount / pods.length) * 100)}%` : '0%',
                      background: '#006aff'
                    }} />
                  </div>
                  <p className="text-xs dark:text-brand-muted text-slate-400 mt-1 text-right">
                    {pods.length > 0 ? Math.round((activeCount / pods.length) * 100) : 0}% active
                  </p>
                </>
              ) : (
                <p className="text-sm dark:text-brand-muted text-slate-400">No pods yet.</p>
              )}
            </Card>
          </motion.div>

          {/* Alerts */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card hover={false} className="p-5">
              <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-3">Alerts</h3>
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-xs border cursor-pointer
                    ${a.level === 'red'    ? 'dark:bg-red-500/8 bg-red-50 dark:border-red-500/20 border-red-200' :
                      a.level === 'yellow' ? 'dark:bg-amber-500/10 bg-amber-50 dark:border-amber-500/20 border-amber-200' :
                      'dark:bg-brand-blue/10 bg-blue-50 dark:border-brand-blue/20 border-blue-200'}`}
                    onClick={() => a.to && navigate(a.to)}>
                    <span>{a.icon}</span>
                    <span className="flex-1 dark:text-brand-text text-slate-700 leading-relaxed">{a.msg}</span>
                    {a.to && <span className="text-brand-cyan font-semibold flex-shrink-0">View →</span>}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Recent pods */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card hover={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200 flex items-center justify-between">
            <h3 className="font-bold dark:text-white text-slate-900">Recent Pods</h3>
            <button onClick={() => navigate('/admin/pods')} className="text-xs text-brand-cyan font-semibold hover:underline">View all →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-brand-border border-slate-200">
                  {['Name','Chain','Token','Status','Members','Pot','Created'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-8 text-center dark:text-brand-muted text-slate-400 text-sm">Loading…</td></tr>
                ) : recentPods.map((pod, i) => {
                  const members = pod.pod_members?.length ?? 0
                  return (
                    <motion.tr key={pod.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.04 * i + 0.4 }}
                      onClick={() => navigate('/admin/pods')}
                      className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors cursor-pointer">
                      <td className="px-5 py-4 font-semibold dark:text-white text-slate-900">{pod.name}</td>
                      <td className="px-5 py-4"><Badge variant={pod.chain === 'XRPL' ? 'blue' : 'muted'}>{pod.chain}</Badge></td>
                      <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{pod.token}</td>
                      <td className="px-5 py-4"><Badge variant={STATUS_COLORS[pod.status] ?? 'muted'}>{pod.status}</Badge></td>
                      <td className="px-5 py-4 dark:text-brand-text text-slate-700">{members}/{pod.size}</td>
                      <td className="px-5 py-4 font-bold dark:text-white text-slate-900">{pod.contribution_amount * pod.size} {pod.token}</td>
                      <td className="px-5 py-4 dark:text-brand-muted text-slate-400 text-xs whitespace-nowrap">{timeAgo(pod.created_at)}</td>
                    </motion.tr>
                  )
                })}
                {!loading && recentPods.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center dark:text-brand-muted text-slate-400 text-sm">No pods yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
