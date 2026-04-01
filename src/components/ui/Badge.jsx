import { cn } from './cn'

const variants = {
  blue:   'bg-brand-blue/15 text-brand-cyan border-brand-blue/30',
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  red:    'bg-red-500/15 text-red-400 border-red-500/30',
  muted:  'dark:bg-brand-mid bg-slate-100 dark:text-brand-muted text-slate-500 dark:border-brand-border border-slate-200',
}

export default function Badge({ children, variant = 'blue', className }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold border',
      variants[variant], className
    )}>
      {children}
    </span>
  )
}
