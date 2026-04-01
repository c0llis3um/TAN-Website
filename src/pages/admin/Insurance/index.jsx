import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const HISTORY = [
  { month: 'Oct', balance: 28000 },
  { month: 'Nov', balance: 31000 },
  { month: 'Dec', balance: 27000 },
  { month: 'Jan', balance: 24500 },
  { month: 'Feb', balance: 22000 },
  { month: 'Mar', balance: 18200 },
]

const EVENTS = [
  { date: '2026-03-22', type: 'CLAIM',      pod: 'T-0020', amount: -800,  desc: 'Default coverage — Test Pod Alpha',    status: 'PAID'    },
  { date: '2026-02-28', type: 'CLAIM',      pod: 'T-0015', amount: -1200, desc: 'Default coverage — Northside Amigos',  status: 'PAID'    },
  { date: '2026-02-10', type: 'DEPOSIT',    pod: null,     amount: 5000,  desc: 'Protocol fee sweep',                  status: 'SETTLED' },
  { date: '2026-01-30', type: 'CLAIM',      pod: 'T-0009', amount: -600,  desc: 'Default coverage — South Loop Group', status: 'PAID'    },
  { date: '2026-01-05', type: 'DEPOSIT',    pod: null,     amount: 3500,  desc: 'Protocol fee sweep',                  status: 'SETTLED' },
  { date: '2025-12-15', type: 'DEPOSIT',    pod: null,     amount: 4200,  desc: 'Initial seed deposit',                status: 'SETTLED' },
]

const floor = 25000
const current = 18200
const pct = Math.round((current / floor) * 100)

const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }
const stagger = { visible: { transition: { staggerChildren: 0.07 } } }

export default function AdminInsurance() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Insurance Pool</h1>
        <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">Global default coverage · $25K minimum floor</p>
      </div>

      {/* Status banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        className="p-5 rounded-2xl border bg-red-500/8 border-red-500/30 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center text-2xl">🛡️</div>
          <div>
            <p className="font-bold dark:text-white text-slate-900">Pool below minimum floor</p>
            <p className="text-sm dark:text-brand-muted text-slate-500">Current balance is ${(floor - current).toLocaleString()} below the $25K requirement</p>
          </div>
        </div>
        <button className="px-5 py-2.5 rounded-xl bg-gradient-brand text-white font-bold text-sm shadow-glow-sm hover:shadow-glow transition-all">
          Replenish Pool
        </button>
      </motion.div>

      {/* KPI row */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Current Balance', value: `$${current.toLocaleString()}`,    sub: `${pct}% of floor`,        color: 'text-red-400'     },
          { label: 'Floor Minimum',   value: `$${floor.toLocaleString()}`,      sub: 'Protocol requirement',    color: 'text-brand-cyan'  },
          { label: 'Claims YTD',      value: '$2,600',                          sub: '3 events paid',           color: 'text-amber-400'   },
          { label: 'Coverage Ratio',  value: '100%',                            sub: 'All claims honored',      color: 'text-emerald-400' },
        ].map(kpi => (
          <motion.div key={kpi.label} variants={item}>
            <Card hover={false} className="p-5">
              <div className={`text-2xl font-extrabold mb-1 ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs dark:text-brand-muted text-slate-500 font-semibold">{kpi.label}</div>
              <div className="text-xs dark:text-brand-muted text-slate-400 mt-0.5">{kpi.sub}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Balance gauge + chart */}
      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card hover={false} className="p-6 h-full flex flex-col items-center justify-center gap-4">
            <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-2 self-start">Pool Health</h3>
            <HealthGauge pct={pct} current={current} floor={floor} />
          </Card>
        </motion.div>

        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          <Card hover={false} className="p-6 h-full">
            <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-6">Balance History</h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={HISTORY}>
                <defs>
                  <linearGradient id="insGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#006aff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#006aff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5a8a9f' }} axisLine={false} tickLine={false} width={50}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#0d2a3a', border: '1px solid #1a3d52', borderRadius: 12, fontSize: 12 }}
                  itemStyle={{ color: '#a0c4d8' }} labelStyle={{ color: '#fff', fontWeight: 700 }}
                  formatter={v => [`$${v.toLocaleString()}`, 'Balance']}
                />
                <Area type="monotone" dataKey="balance" stroke="#006aff" strokeWidth={2} fill="url(#insGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Event log */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card hover={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-brand-border border-slate-200">
            <h3 className="font-bold dark:text-white text-slate-900">Transaction History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-brand-border border-slate-200">
                  {['Date','Type','Pod','Amount','Description','Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((e, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * i + 0.35 }}
                    className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/30 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{e.date}</td>
                    <td className="px-5 py-4">
                      <Badge variant={e.type === 'CLAIM' ? 'red' : 'green'}>{e.type}</Badge>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs dark:text-brand-muted text-slate-400">{e.pod ?? '—'}</td>
                    <td className={`px-5 py-4 font-bold text-sm ${e.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {e.amount < 0 ? `-$${Math.abs(e.amount).toLocaleString()}` : `+$${e.amount.toLocaleString()}`}
                    </td>
                    <td className="px-5 py-4 dark:text-brand-text text-slate-700">{e.desc}</td>
                    <td className="px-5 py-4"><Badge variant="muted">{e.status}</Badge></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

function HealthGauge({ pct, current, floor }) {
  const r = 60, circ = 2 * Math.PI * r
  const half = circ / 2
  const offset = half - (Math.min(pct, 100) / 100) * half
  const color = pct >= 100 ? '#34d399' : pct >= 80 ? '#006aff' : pct >= 60 ? '#f59e0b' : '#f87171'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width="160" height="90" viewBox="0 0 160 90">
          {/* Track */}
          <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="#1a3d52" strokeWidth="12" strokeLinecap="round" />
          {/* Fill */}
          <motion.path
            d="M 20 80 A 60 60 0 0 1 140 80"
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={half} strokeDashoffset={half}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <motion.div
            className="text-2xl font-extrabold"
            style={{ color }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          >
            {pct}%
          </motion.div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold dark:text-white text-slate-900">${current.toLocaleString()} <span className="text-xs font-normal dark:text-brand-muted text-slate-400">/ ${floor.toLocaleString()}</span></p>
        <p className="text-xs dark:text-brand-muted text-slate-500 mt-0.5">of minimum floor</p>
      </div>
    </div>
  )
}
