/**
 * Real-time event bus and cross-tab synchronizer for NexTill POS.
 * Enables instantaneous UI updates across components and browser tabs
 * when transactions, returns, inventory, or settings change.
 */

const CHANNEL_NAME = 'nextill_realtime_sync'

let broadcastChannel = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME)
    broadcastChannel.onmessage = (event) => {
      if (event?.data?.type) {
        window.dispatchEvent(new CustomEvent(event.data.type, { detail: event.data.payload }))
      }
    }
  }
} catch {
  // BroadcastChannel not available or blocked in current sandbox
}

/**
 * Broadcast an event locally and across tabs.
 * @param {string} type - Event type (e.g. 'sale:created', 'sale:updated', 'sale:refunded')
 * @param {any} [payload] - Optional event payload
 */
export function broadcastRealtimeEvent(type, payload = null) {
  if (typeof window === 'undefined') return

  // 1. Dispatch locally in the current window
  try {
    window.dispatchEvent(new CustomEvent(type, { detail: payload }))
  } catch (err) {
    console.error('Local event dispatch failed:', err)
  }

  // 2. Broadcast to other open tabs / windows
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type, payload, timestamp: Date.now() })
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
}

/**
 * Subscribe to realtime event(s).
 * @param {string|string[]} events - Single event name or array of event names
 * @param {Function} callback - Callback function receiving the event
 * @returns {Function} Unsubscribe function
 */
export function subscribeRealtimeEvents(events, callback) {
  if (typeof window === 'undefined') return () => {}

  const eventList = Array.isArray(events) ? events : [events]
  const handler = (e) => callback(e.detail, e.type)

  eventList.forEach((evt) => {
    window.addEventListener(evt, handler)
  })

  return () => {
    eventList.forEach((evt) => {
      window.removeEventListener(evt, handler)
    })
  }
}
