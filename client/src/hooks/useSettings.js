import { useContext } from 'react'
import { SettingsContext } from '../context/contexts'

export function useSettings() {
  return useContext(SettingsContext)
}
