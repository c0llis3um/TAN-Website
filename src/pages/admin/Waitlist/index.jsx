import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { adminGetWaitlist } from '@/lib/db'

const stagger = { visible: { transition: { staggerChildren: 0.05 } } }
const row     = { hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }

export default function AdminWaitlist() {
  const [list,    setList]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('ALL')  // ALL | PENDING | INVITED

  useEffect(() => {
    adminGetWaitlist().then(({ data }) => {
      setList(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = list.filter(w => {
    const matchSearch = (w.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      w.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'ALL' || (filter === 'INVITED' ? w.invited : !w.invited)
    return matchSearch && matchFilter
  })

  const pending  = list.filter(w => !w.invited).length
  const invited  = list.filter(w => w.invited).length

  // Source breakdown
  const sourceMap = {}
  list.forEach(w => { if (w.source) sourceMap[w.source] = (sourceMap[w.source] ?? 0) + 1 })
  const topSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold dark:text-white text-slate-900">Waitlist</h1>
          <p className="text-sm dark:text-brand-muted text-slate-500 mt-0.5">
            {loading ? '…' : `${list.length} total · ${pending} pending · ${invited} invited`}
          </p>
        </div>
        <button
          onClick={() => {
            const csv = ['Name,Email,Source,Chain,Lang,Joined,Invited']
              .concat(list.map(w => `"${w.name ?? ''}","${w.email}","${w.source ?? ''}","${w.chain_pref ?? ''}","${w.lang}","${w.created_at}","${w.invited}"`))
              .join('\n')
            const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv); a.download = 'waitlist.csv'; a.click()
          }}
          className="text-xs px-4 py-2 rounded-xl bg-brand-blue/10 text-brand-cyan font-semibold hover:bg-brand-blue/20 transition-colors"
        >
          Export CSV ↓
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',   value: list.length,                                    color: 'text-brand-cyan'  },
          { label: 'Pending', value: pending,                                         color: 'text-amber-400'   },
          { label: 'Invited', value: invited,                                         color: 'text-emerald-400' },
          { label: 'Spanish', value: list.filter(w => w.lang === 'es').length,        color: 'text-brand-cyan'  },
        ].map(s => (
          <Card key={s.label} hover={false} className="p-4">
            <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-xs dark:text-brand-muted text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Top sources */}
      {topSources.length > 0 && (
        <Card hover={false} className="p-5">
          <h3 className="font-bold dark:text-white text-slate-900 text-sm mb-3">Top Sources</h3>
          <div className="flex flex-wrap gap-2">
            {topSources.map(([source, count]) => (
              <div key={source} className="flex items-center gap-2 px-3 py-1.5 rounded-xl dark:bg-brand-dark bg-slate-50 border dark:border-brand-border border-slate-200 text-xs">
                <span className="dark:text-brand-text text-slate-600 font-semibold">{source}</span>
                <span className="text-brand-cyan font-bold">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card hover={false} className="p-4">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl text-sm dark:bg-brand-dark bg-slate-50 dark:border-brand-border border border-slate-200 dark:text-white text-slate-900 dark:placeholder-brand-muted placeholder-slate-400 outline-none focus:border-brand-blue/60"
          />
          <div className="flex gap-1.5">
            {['ALL','PENDING','INVITED'].map(opt => (
              <button key={opt} onClick={() => setFilter(opt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${filter === opt ? 'bg-gradient-brand text-white' : 'dark:bg-brand-dark bg-slate-100 dark:text-brand-muted text-slate-500 dark:hover:bg-brand-mid hover:bg-slate-200'}`}>
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
                {['Name','Email','Source','Chain','Lang','Notes','Joined','Status'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider dark:text-brand-muted text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={stagger} initial="hidden" animate="visible">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center dark:text-brand-muted text-slate-400">Loading…</td></tr>
              ) : filtered.map(w => (
                <motion.tr key={w.id} variants={row}
                  className="border-b dark:border-brand-border/40 border-slate-100 last:border-0 dark:hover:bg-brand-mid/40 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 font-semibold dark:text-white text-slate-900">{w.name ?? '—'}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{w.email}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-text text-slate-600">{w.source ?? '—'}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400">{w.chain_pref ?? '—'}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 uppercase">{w.lang}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 max-w-[160px] truncate">{w.notes ?? '—'}</td>
                  <td className="px-5 py-4 text-xs dark:text-brand-muted text-slate-400 whitespace-nowrap">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">{w.invited ? <Badge variant="green">Invited</Badge> : <Badge variant="yellow">Pending</Badge>}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center dark:text-brand-muted text-slate-400 py-12 text-sm">No entries found.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
