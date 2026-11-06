import { useState, useEffect, useCallback, useMemo } from 'react'
import { SettingsContext, DEFAULT_SETTINGS } from './contexts'
import { settingsService } from '../services/settings'
import { setActiveCurrencySymbol } from '../utils/formatCurrency'

function getInitialSettings() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached = localStorage.getItem('nextill_settings') || localStorage.getItem('dashpos_settings')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_SETTINGS, ...parsed }
        }
      }
    }
  } catch {
    // Ignore JSON or localStorage parse errors
  }
  return DEFAULT_SETTINGS
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const initial = getInitialSettings()
    if (initial.currency_symbol) {
      setActiveCurrencySymbol(initial.currency_symbol)
    }
    return initial
  })

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings }
      if (merged.currency_symbol) {
        setActiveCurrencySymbol(merged.currency_symbol)
      }
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('nextill_settings', JSON.stringify(merged))
        }
      } catch {
        // Ignore localStorage quota errors
      }
      return merged
    })
  }, [])

  useEffect(() => {
    settingsService
      .get()
      .then((res) => {
        const data = res.data?.data
        if (data) {
          updateSettings(data)
        }
      })
      .catch(() => {
        // Fall back silently
      })
  }, [updateSettings])

  const contextValue = useMemo(() => ({
    ...settings,
    updateSettings,
  }), [settings, updateSettings])

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>
}
