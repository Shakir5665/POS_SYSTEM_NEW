import '../styles/auth-premium.css'

function LineIcon({ type }) {
  const paths = {
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>
}

function MetricCard({ type, label, value, className }) {
  return <div className={`auth-metric ${className}`} aria-hidden="true">
    <div className="auth-metric-top"><span>{label}</span><i><LineIcon type={type}/></i></div>
    <strong>{value}</strong>
    {type === 'chart' && <svg className="auth-spark" viewBox="0 0 132 32" preserveAspectRatio="none"><path d="M2 26 23 20 43 23 64 12 84 17 105 6 130 10" fill="none" stroke="url(#spark)" strokeWidth="3" strokeLinecap="round"/><defs><linearGradient id="spark"><stop stopColor="#2563eb"/><stop offset="1" stopColor="#6366f1"/></linearGradient></defs></svg>}
  </div>
}

function ProductPreview() {
  return <div className="auth-showcase" aria-label="Illustrative NexTill product preview">
    <div className="auth-product-stage">
      <div className="auth-preview-label"><span className="auth-live-dot"/> PRODUCT PREVIEW</div>
      <img className="auth-product-image" src="/NexTill%20POS%20Dashboard%20Laptop%20Render.png" alt="NexTill business dashboard displayed on a laptop" fetchPriority="high" />
    </div>
    <MetricCard type="chart" label="TOTAL SALES · DEMO" value="Rs. 125,450" className="metric-sales"/>
    <MetricCard type="cart" label="TODAY'S ORDERS · DEMO" value="324" className="metric-orders"/>
    <MetricCard type="box" label="INVENTORY HEALTH · DEMO" value="98%" className="metric-products"/>
  </div>
}

function AuthMarketing() {
  return <section className="auth-marketing">
    <div className="auth-brand"><img src="/logo.png" alt="NexTill"/><span>NexTill <b>|</b></span><strong className="auth-pos-pill">POS</strong></div>
    <div className="auth-marketing-copy">
      <h2>Run your retail<br/>business with clarity</h2>
      <p className="auth-intro">A modern POS and retail management platform that keeps sales, inventory, and your business performance in one place.</p>
      <div className="auth-features">
        <article><i className="feature-blue"><LineIcon type="cart"/></i><div><b>Faster checkout</b></div></article>
        <article><i className="feature-indigo"><LineIcon type="box"/></i><div><b>Smarter inventory</b></div></article>
        <article><i className="feature-violet"><LineIcon type="chart"/></i><div><b>Real-time insights</b></div></article>
      </div>
    </div>
    <ProductPreview/>
    <p className="auth-tagline"><span aria-hidden="true">✓</span> Trusted retail management platform</p>
  </section>
}

export function AuthLayout({ children, marketing = false }) {
  if (marketing) return <main className="auth-premium"><AuthMarketing/><section className="auth-login-region"><div className="auth-login-card">{children}</div></section></main>
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
