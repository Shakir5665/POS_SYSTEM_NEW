import { Modal } from './Modal'
import { Button } from './Button'

export function LogoutModal({ isOpen, onClose, onConfirm, isLoading = false }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Sign Out" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-amber-50/80 border border-amber-200/80">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-snug">Are you sure you want to log out?</p>
            <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
              You will need to re-enter your username and password to access the terminal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 font-semibold"
            onClick={onClose}
            disabled={isLoading}
          >
            Stay Signed In
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 font-bold shadow-2xs"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </Modal>
  )
}
