import { useAuth } from '../hooks/useAuth'

export default function PlaceholderPage({ title }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass rounded-3xl p-8 text-center max-w-md w-full">
        <div className="w-14 h-14 bg-gradient-to-tr from-blue-100 to-indigo-100 border border-indigo-200/60 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xs">
          <svg className="w-7 h-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">{title}</h1>
        <p className="text-slate-600 text-sm mb-1">Logged in as <strong className="text-slate-900">{user?.full_name}</strong></p>
        <p className="text-slate-400 text-xs mb-6">Role: {user?.role}</p>
        <p className="text-slate-500 text-sm mb-6">This section is currently under construction.</p>
        <button
          onClick={logout}
          className="px-5 py-2.5 text-xs font-semibold bg-white/90 hover:bg-white text-slate-700 border border-slate-200/90 rounded-xl shadow-2xs hover:shadow-xs transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
