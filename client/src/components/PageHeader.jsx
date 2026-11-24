export function PageHeader({
  title,
  subtitle,
  actions,
  action,
  badge,
  className = '',
}) {
  const headerActions = actions || action
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      {headerActions && (
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {headerActions}
        </div>
      )}
    </div>
  )
}
