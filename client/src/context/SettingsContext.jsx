import { useState, useEffect } from 'react'
import { SettingsContext, DEFAULT_SETTINGS } from './contexts'
import { settingsService } from '../services/settings'

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    settingsService
      .get()
      .then((res) => {
        const data = res.data?.data
        if (data) setSettings((prev) => ({ ...prev, ...data }))
      })
      .catch(() => {
        // Fall back to defaults silently
      })
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}
