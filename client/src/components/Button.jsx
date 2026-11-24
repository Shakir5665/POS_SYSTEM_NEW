export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading = false,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const variants = {
    primary:
      'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-2xs hover:shadow-primary-glow hover:-translate-y-0.5 active:translate-y-0 focus:ring-primary-500',
    secondary:
      'bg-white/85 hover:bg-white text-slate-700 border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-indigo-200 backdrop-blur-xs focus:ring-primary-500',
    danger:
      'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-2xs hover:shadow-sm focus:ring-rose-500',
    success:
      'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-2xs hover:shadow-sm focus:ring-emerald-500',
    ghost:
      'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 focus:ring-slate-300',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 font-medium rounded-lg',
    md: 'px-4 py-2 text-sm gap-2 rounded-xl',
    lg: 'px-5 py-2.5 text-base gap-2.5 rounded-xl font-semibold',
  }

  return (
    <button
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
