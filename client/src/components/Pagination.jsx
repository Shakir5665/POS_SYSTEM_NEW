export function Pagination({ page, total_pages, onPageChange }) {
  if (total_pages <= 1) return null

  const pages = []
  const delta = 2
  const left = Math.max(1, page - delta)
  const right = Math.min(total_pages, page + delta)

  if (left > 1) {
    pages.push(1)
    if (left > 2) pages.push('...')
  }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total_pages) {
    if (right < total_pages - 1) pages.push('...')
    pages.push(total_pages)
  }

  const btnBase = 'px-3 py-1.5 text-xs font-medium rounded-xl transition-all duration-150 select-none'
  const active = `${btnBase} bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs`
  const inactive = `${btnBase} bg-white/80 hover:bg-white text-slate-600 border border-slate-200/80 hover:border-indigo-200 shadow-2xs`
  const disabled = `${btnBase} bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed`

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className={page === 1 ? disabled : inactive}
        aria-label="Previous page"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-xs">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={p === page ? active : inactive}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === total_pages}
        className={page === total_pages ? disabled : inactive}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  )
}
