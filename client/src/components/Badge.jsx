export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-slate-100/90 text-slate-700 border-slate-200/80',
    primary: 'bg-blue-50/90 text-blue-700 border-blue-200/80',
    success: 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80',
    danger: 'bg-rose-50/90 text-rose-700 border-rose-200/80',
    warning: 'bg-amber-50/90 text-amber-700 border-amber-200/80',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant] || variants.default} ${className}`}
    >
      {children}
    </span>
  )
}
