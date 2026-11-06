export function Pagination({ page, total_pages, onPageChange }) {
  if (total_pages <= 1) return null

  const pages = []
  const delta = 2
  const left = Math.max(1, page - delta)
  const right = Math.min(total_pages, page + delta)

  if (left > 1) { pages.push(1); if (left > 2) pages.push('...') }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total_pages) { if (right < total_pages - 1) pages.push('...'); pages.push(total_pages) }

  const btnBase = 'px-3 py-1.5 text-sm rounded-lg transition'
  const active = `${btnBase} bg-primary-600 text-white font-medium`
  const inactive = `${btnBase} text-gray-600 hover:bg-gray-100`
  const disabled = `${btnBase} text-gray-300 cursor-not-allowed`

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className={page === 1 ? disabled : inactive}
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
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
      >
        ›
      </button>
    </div>
  )
}
