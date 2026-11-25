import { Button } from '../components/Button'
import { AuthLayout } from '../layouts/AuthLayout'

export default function SystemLockedPage({ onRetry }) {
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.3 3.86 2.57 17.25A2 2 0 004.3 20.25h15.4a2 2 0 001.73-3L13.7 3.86a2 2 0 00-3.46 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">System access is paused</h1>
        <p className="mt-2 text-sm text-slate-500">Contact your system administrator for access.</p>
        <Button className="mt-6 w-full" onClick={onRetry}>Try again</Button>
      </div>
    </AuthLayout>
  )
}
