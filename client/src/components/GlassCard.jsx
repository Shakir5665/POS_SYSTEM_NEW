export function GlassCard({
  children,
  className = '',
  solid = false,
  hover = true,
  padding = 'p-6',
  ...props
}) {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${
        solid
          ? 'bg-white/95 border border-slate-200/80 shadow-xs'
          : 'bg-white/80 backdrop-blur-md border border-white/90 shadow-glass-sm'
      } ${hover ? 'hover:shadow-glass hover:border-indigo-100/80' : ''} ${padding} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
