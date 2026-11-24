import { Link } from 'react-router-dom'

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBg = 'bg-primary-50 text-primary-600',
  to,
  tooltip,
  trend,
  className = '',
}) {
  const displayTooltip = tooltip !== undefined ? tooltip : (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined)

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white/85 backdrop-blur-md border border-white/90 shadow-glass-sm p-5 sm:p-6 transition-all duration-200 ${
        to ? 'hover:shadow-glass hover:border-indigo-200 hover:-translate-y-0.5 group cursor-pointer' : ''
      } ${className}`}
      title={displayTooltip}
    >
      {/* Subtle ambient corner gradient */}
      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100/40 to-primary-100/0 pointer-events-none" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-primary-600 transition-colors">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 truncate">
              {value}
            </p>
            {trend && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {trend.value}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1.5 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs transition-transform duration-200 ${to ? 'group-hover:scale-105' : ''} ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      {to && (
        <div className="mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between text-xs font-medium text-slate-400 group-hover:text-primary-600 transition-colors">
          <span>View details</span>
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-2xl">
        {content}
      </Link>
    )
  }

  return content
}
