import { useId } from 'react'

export function Input({ label, error, className = '', id, type, step, ...props }) {
  // Link the label to the input so clicking it focuses the field and screen readers announce it
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>}
      <input
        id={inputId}
        type={type}
        step={step ?? (type === 'number' ? 'any' : undefined)}
        className={`block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition
          ${error ? 'border-danger-500 bg-danger-50' : 'border-gray-300 bg-white'}
          ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  )
}
