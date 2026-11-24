export function StatusBadge({ status, label, className = '' }) {
  const norm = String(status || '').toUpperCase()
  let colorClass = 'bg-slate-100 text-slate-700 border-slate-200'

  if (['ACTIVE', 'COMPLETED', 'PAID', 'SUCCESS', 'RECEIVED'].includes(norm)) {
    colorClass = 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80'
  } else if (['PENDING', 'PARTIAL', 'WARNING', 'DRAFT', 'ORDERED'].includes(norm)) {
    colorClass = 'bg-amber-50/90 text-amber-700 border-amber-200/80'
  } else if (['INACTIVE', 'CANCELLED', 'VOID', 'FAILED', 'OVERDUE', 'DANGER', 'OUT_OF_STOCK'].includes(norm)) {
    colorClass = 'bg-rose-50/90 text-rose-700 border-rose-200/80'
  } else if (['CREDIT', 'INFO', 'PRIMARY'].includes(norm)) {
    colorClass = 'bg-indigo-50/90 text-indigo-700 border-indigo-200/80'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass} ${className}`}>
      {label || status}
    </span>
  )
}
