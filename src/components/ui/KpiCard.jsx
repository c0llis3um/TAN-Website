import { motion } from 'framer-motion'

export default function KpiCard({ label, value, sub, accent = false, loading }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border flex flex-col gap-1 ${
        accent
          ? 'dark:bg-brand-blue/10 bg-blue-50 dark:border-brand-blue/30 border-blue-200'
          : 'dark:bg-brand-dark bg-slate-50 dark:border-brand-border border-slate-200'
      }`}>
      <p className="text-xs font-semibold dark:text-brand-muted text-slate-500 uppercase tracking-wider">{label}</p>
      {loading
        ? <div className="h-6 w-20 dark:bg-brand-mid bg-slate-200 rounded animate-pulse" />
        : <p className={`text-lg font-extrabold ${accent ? 'gradient-text' : 'dark:text-white text-slate-900'}`}>{value}</p>
      }
      {sub && <p className="text-[11px] dark:text-brand-muted text-slate-400">{sub}</p>}
    </motion.div>
  )
}
