import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'
import { setActiveCurrencySymbol } from '../utils/formatCurrency'

beforeEach(() => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  } catch {}
  setActiveCurrencySymbol('LKR')
})

