import './loading.css'

export default function AppSplashScreen({
  isSlow = false,
  hasError = false,
  isExiting = false,
  onRetry,
}) {
  return (
    <div
      className={`nextill-splash${isExiting ? ' nextill-splash--exiting' : ''}`}
      role={hasError ? 'alert' : 'status'}
      aria-live={hasError ? 'assertive' : 'polite'}
      aria-busy={!hasError}
    >
      <div className="nextill-splash-grid" aria-hidden="true" />
      <div className="nextill-splash-ring nextill-splash-ring--one" aria-hidden="true" />
      <div className="nextill-splash-ring nextill-splash-ring--two" aria-hidden="true" />

      <section className="nextill-splash-content" aria-label="NexTill startup">
        <div className="nextill-splash-brand">
          <div className="nextill-splash-logo-window" aria-hidden="true">
            <img
              src="/logo.png"
              alt=""
              width="112"
              height="75"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <h1 className="nextill-splash-wordmark">NexTill</h1>
          <p className="nextill-splash-tagline">Business. Simplified.</p>
        </div>

        <div className="nextill-splash-loader" aria-hidden="true">
          <span />
        </div>

        {hasError ? (
          <div className="nextill-splash-message">
            <h2>Connection interrupted</h2>
            <p>We&apos;re having trouble connecting to NexTill. Please check your internet connection and try again.</p>
          </div>
        ) : isSlow ? (
          <div className="nextill-splash-message">
            <h2>Taking longer than expected</h2>
            <p>We&apos;re still checking your session. Please check your internet connection if this continues.</p>
          </div>
        ) : (
          <p className="nextill-splash-status">Verifying your session...</p>
        )}

        {(hasError || isSlow) && (
          <button type="button" className="nextill-splash-retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </section>
    </div>
  )
}
