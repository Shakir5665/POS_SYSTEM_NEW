(() => {
  const splash = document.getElementById('nextill-boot')
  const fallback = document.getElementById('nextill-boot-fallback')
  const retry = document.getElementById('nextill-boot-retry')
  const fallbackTimer = window.setTimeout(() => {
    if (fallback) fallback.hidden = false
  }, 15000)

  retry?.addEventListener('click', () => window.location.reload())
  window.__nextillBootHandoff = () => {
    window.clearTimeout(fallbackTimer)
    if (!splash) return
    splash.classList.add('boot-out')
    window.setTimeout(() => splash.remove(), 280)
  }
})()
