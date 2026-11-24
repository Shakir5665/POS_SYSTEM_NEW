import { useId, forwardRef } from 'react'

export const Input = forwardRef(function Input(
  { label, error, className = '', id, type, step, ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 tracking-wide">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        step={step ?? (type === 'number' ? 'any' : undefined)}
        className={`block w-full rounded-xl border px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150
          ${
            error
              ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-slate-200/90 bg-white/90 hover:border-slate-300'
          }
          ${props.disabled ? 'bg-slate-100/80 text-slate-400 cursor-not-allowed border-slate-200' : ''}
          ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
})
