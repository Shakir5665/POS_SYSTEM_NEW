import { useEffect, useRef } from 'react'

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const modalRef = useRef(null)
  const previousActiveElementRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const wasOpenRef = useRef(false)

  // Manage focus ONLY on opening and closing transitions
  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus()
        }
      }
      return
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      previousActiveElementRef.current = document.activeElement

      const timer = setTimeout(() => {
        const modal = modalRef.current
        if (!modal) return
        if (!modal.contains(document.activeElement)) {
          const autoFocusEl =
            modal.querySelector('[autofocus]') ||
            modal.querySelector(
              'input, select, textarea, button:not([title="Close"]):not([aria-label="Close"])'
            )
          autoFocusEl?.focus()
        }
      }, 50)

      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Keydown listener for Escape and Tab trap
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current
        if (!modal) return
        const focusable = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop with soft blur */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
          onClick={onClose}
        />
        {/* Floating Glass Dialog */}
        <div
          ref={modalRef}
          className={`relative bg-white/95 backdrop-blur-xl rounded-2xl border border-white/90 shadow-glass-xl w-full ${sizes[size]} z-10 transition-all duration-200 overflow-hidden`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/90 bg-white/50">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-5 max-h-[calc(100vh-10rem)] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}
