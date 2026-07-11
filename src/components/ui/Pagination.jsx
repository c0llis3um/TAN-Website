import { PAGE_SIZE } from '@/lib/usePagination'

export default function Pagination({ page, pageCount, total, onChange }) {
  if (total === 0) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end   = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t dark:border-brand-border border-slate-200">
      <p className="text-xs dark:text-brand-muted text-slate-400">{start}–{end} of {total}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold dark:bg-brand-dark bg-slate-100 dark:text-brand-text text-slate-600 dark:hover:bg-brand-mid hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ← Prev
        </button>
        <span className="text-xs dark:text-brand-muted text-slate-400 px-1">Page {page} / {pageCount}</span>
        <button onClick={() => onChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold dark:bg-brand-dark bg-slate-100 dark:text-brand-text text-slate-600 dark:hover:bg-brand-mid hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Next →
        </button>
      </div>
    </div>
  )
}
