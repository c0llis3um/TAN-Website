import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetAllPods } from '@/lib/db'

const CREATION_FEE = 2  // $2 per pod

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 864e5)
  const h = Math.floor(diff / 36e5)
  return d > 0 ? `${d}d ago` : `${h}h ago`
}

export default function AdminRevenue() {
  const [pods,    setPods]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminGetAllPods().then(({ data }) => {
      setPods(data ?? [])
      setLoading(false)
    })
  }, [])

  const paidPods   = pods.filter(p => p.creation_fee_paid)
  const totalFees  = paidPods.length * CREATION_FEE
  const thisMonth  = paidPods.filter(p => {
    const d = new Date(p.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const feesMonth  = thisMonth.length * CREATION_FEE

  // Monthly breakdown (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i))
    const label = d.toLocaleString('default', { month: 'short' })
    const count = paidPods.filter(p => {
      const pd = new Date(p.created_at)
      return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear()
    }).length
    return { month: label, fees: count * CREATION_FEE, pods: count }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Revenue</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">Pod creation fees · Payout fees coming in Sprint 4</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue',   value: loading ? '…' : `$${totalFees}`,             color: 'text-emerald-400' },
          { label: 'This Month',      value: loading ? '…' : `$${feesMonth}`,              color: 'text-brand-cyan'  },
          { label: 'Paid Pods',       value: loading ? '…' : paidPods.length,              color: 'text-brand-cyan'  },
          { label: 'Creation Fee',    value: `$${CREATION_FEE}/pod`,                       color: 'text-amber-400'   },
        ].map(s => (
          <Card key={s.label} hover={false} className="p-4">
            <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-xs dark:text-brand-muted text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card hover={false} className="p-6">
        <h3 className="font-bold dark:text-white text-slate-900 mb-6">Monthly Revenue (last 6 months)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ background: '#0d2a3a', border: '1px solid #1a3d52', borderRadius: 12, fontSize: 12 }}
              itemStyle={{ color: '#a0c4d8' }} labelStyle={{ color: '#fff', fontWeight: 700 }}
              formatter={v => [`$${v}`, 'Revenue']}
            />
            <Bar dataKey="fees" name="Revenue ($)" fill="#006aff" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Transaction log */}
      <Card hover={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200">
          <h3 className="font-bold dark:text-white text-slate-900">Creation Fee Log</h3>
          <p className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">Only pods with creation_fee_paid = true</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-brand-border border-slate-200">
                {['Pod','Chain','Token','Fee','Tx Hash','Date'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
              ) : paidPods.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">No paid creation fees yet.</td></tr>
              ) : paidPods.map((pod, i) => (
                <motion.tr key={pod.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * i }}
                  className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-semibold dark:text-white text-slate-900">{pod.name}</td>
                  <td className="px-5 py-4"><Badge variant={pod.chain === 'XRPL' ? 'blue' : 'muted'}>{pod.chain}</Badge></td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{pod.token}</td>
                  <td className="px-5 py-4 font-bold text-emerald-400">${CREATION_FEE}</td>
                  <td className="px-5 py-4 font-mono text-xs dark:text-brand-muted text-slate-400 max-w-[160px] truncate">
                    {pod.creation_fee_tx ? `${pod.creation_fee_tx.slice(0,18)}…` : '—'}
                  </td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{timeAgo(pod.created_at)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
