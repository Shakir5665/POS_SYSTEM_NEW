export function Table({ columns, data, isLoading, loading, emptyMessage = 'No data found.', onRowClick }) {
  const isTableLoading = isLoading || loading
  if (isTableLoading) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-md shadow-2xs">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/70">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5">
                    <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-md shadow-2xs">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/70">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="py-12 text-center text-slate-400 text-sm font-medium">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-glass-sm">
      <table className="min-w-full divide-y divide-slate-100/90">
        <thead className="bg-gradient-to-r from-slate-50/95 to-indigo-50/40">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/80 bg-white/60">
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={`hover:bg-indigo-50/45 transition-colors duration-150 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
