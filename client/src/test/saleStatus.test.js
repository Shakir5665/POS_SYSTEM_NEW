import { describe, it, expect } from 'vitest'
import { saleStatus, canRefund } from '../utils/saleStatus'

describe('saleStatus', () => {
  it('labels each state', () => {
    expect(saleStatus({ payment_status: 'COMPLETED', refund_requested_at: null })).toEqual({ label: 'Completed', variant: 'success' })
    expect(saleStatus({ payment_status: 'COMPLETED', refund_requested_at: '2026-10-19T10:00:00Z' })).toEqual({ label: 'Refund pending', variant: 'warning' })
    expect(saleStatus({ payment_status: 'REFUNDED', refund_requested_at: null })).toEqual({ label: 'Refunded', variant: 'danger' })
  })
})

describe('canRefund', () => {
  it('allows only completed sales with no refund in progress', () => {
    expect(canRefund({ payment_status: 'COMPLETED', refund_requested_at: null })).toBe(true)
    expect(canRefund({ payment_status: 'COMPLETED', refund_requested_at: '2026-10-19T10:00:00Z' })).toBe(false)
    expect(canRefund({ payment_status: 'REFUNDED', refund_requested_at: null })).toBe(false)
  })
})
