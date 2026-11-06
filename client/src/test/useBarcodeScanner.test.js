import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers onScan when rapid keystrokes arrive and end with Enter', () => {
    const handleScan = vi.fn()
    renderHook(() => useBarcodeScanner(handleScan, { maxInterval: 35, minLength: 4 }))

    let time = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => time)

    const barcode = '12345678'
    for (const char of barcode) {
      time += 15 // 15ms < 35ms
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }

    // Trailing Enter
    time += 15
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(handleScan).toHaveBeenCalledTimes(1)
    expect(handleScan).toHaveBeenCalledWith('12345678')
  })

  it('does NOT trigger onScan when human types slowly (> 35ms interval)', () => {
    const handleScan = vi.fn()
    renderHook(() => useBarcodeScanner(handleScan, { maxInterval: 35, minLength: 4 }))

    let time = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => time)

    const text = '12345678'
    for (const char of text) {
      time += 100 // 100ms > 35ms -> human typing
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }

    time += 100
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(handleScan).not.toHaveBeenCalled()
  })
})
