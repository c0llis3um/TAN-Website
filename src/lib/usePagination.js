import { useState, useEffect } from 'react'

export const PAGE_SIZE = 20

// Client-side pagination over an already-filtered array. Pass a resetKey
// (e.g. search + filter values joined) so the page resets to 1 whenever
// the filters change shape.
export default function usePagination(items, resetKey) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [resetKey])

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageSafe  = Math.min(page, pageCount)
  const paged     = items.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  return { page: pageSafe, setPage, pageCount, paged }
}
