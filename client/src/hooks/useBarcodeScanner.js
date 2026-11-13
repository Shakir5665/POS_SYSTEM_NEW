import { useEffect, useRef } from 'react'

/**
 * Hook for hardware barcode scanners configured in keyboard wedge mode.
 * Distinguishes scanner input from human typing by measuring inter-key latency (<= 35ms).
 *
 * @param {(barcode: string) => void} onScan - Callback when a valid barcode is scanned
 * @param {object} [options]
 * @param {number} [options.maxInterval=35] - Max ms between keystrokes to qualify as scanner
 * @param {number} [options.minLength=4] - Min characters for a barcode
 * @param {boolean} [options.enabled=true] - Whether scanner listening is active
 */
export function useBarcodeScanner(onScan, { maxInterval = 35, minLength = 4, enabled = true } = {}) {
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const bufferRef = useRef([])
  const lastKeyTimeRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e) {
      // Ignore functional modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const now = performance.now()
      const delta = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        const chars = bufferRef.current
        if (chars.length >= minLength) {
          // If the buffer was filled with rapid keystrokes, consume it
          const barcode = chars.join('')
          bufferRef.current = []
          clearTimeout(timerRef.current)

          // Prevent form submits or search triggers caused by the scanner's trailing Enter
          e.preventDefault()
          e.stopPropagation()

          onScanRef.current?.(barcode)
          return
        }
        bufferRef.current = []
        return
      }

      // Single printable characters
      if (e.key.length === 1) {
        if (delta > maxInterval && bufferRef.current.length > 0) {
          // Break in rapid stream -> reset buffer
          bufferRef.current = [e.key]
        } else {
          bufferRef.current.push(e.key)
        }

        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          bufferRef.current = []
        }, maxInterval * 3)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true) // capture phase so scanner is intercepted first
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      clearTimeout(timerRef.current)
    }
  }, [maxInterval, minLength, enabled])
}
