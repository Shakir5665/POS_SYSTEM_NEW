export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-50">
      {/* Decorative ambient glass light orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-300/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-purple-200/25 rounded-full blur-2xl pointer-events-none" />

      {/* Floating Glass Container */}
      <div className="relative bg-white/80 backdrop-blur-xl border border-white/90 shadow-glass-xl rounded-3xl p-8 sm:p-10 w-full max-w-md z-10 transition-all">
        {children}
      </div>
    </div>
  )
}
