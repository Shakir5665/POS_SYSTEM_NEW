import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../services/payments', () => ({
  paymentsService: { unmatched: vi.fn(), refundUnmatched: vi.fn() },
}))

import toast from 'react-hot-toast'
import { paymentsService } from '../services/payments'
import { UnmatchedPayments } from '../components/UnmatchedPayments'

const payment = (overrides) => ({
  id: 'p1',
  reference: 'POS-1-AAAA',
  amount: 2550,
  currency: 'GHS',
  channel: 'mobile_money',
  customer_email: 'buyer@test.com',
  paid_at: '2026-10-25T12:00:00Z',
  refund_requested_at: null,
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())

describe('UnmatchedPayments', () => {
  it('renders nothing when every payment has a sale', async () => {
    paymentsService.unmatched.mockResolvedValue({ data: { data: [] } })
    const { container } = render(<UnmatchedPayments />)
    await waitFor(() => expect(paymentsService.unmatched).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('lists unmatched payments with amount in GH₵ and a Refund button', async () => {
    paymentsService.unmatched.mockResolvedValue({
      data: { data: [payment({}), payment({ id: 'p2', reference: 'POS-2-BBBB', refund_requested_at: '2026-10-25T13:00:00Z' })] },
    })
    render(<UnmatchedPayments />)

    expect(await screen.findByText(/paystack payments without a sale \(2\)/i)).toBeDefined()
    expect(screen.getAllByText('GH₵ 25.50')).toHaveLength(2)
    expect(screen.getAllByText(/mobile money · buyer@test\.com/i)).toHaveLength(2)
    // Only the payment without a pending refund can be refunded
    expect(screen.getAllByRole('button', { name: 'Refund' })).toHaveLength(1)
    expect(screen.getByText('Refund pending')).toBeDefined()
  })

  it('refunds after confirmation and reloads the list', async () => {
    paymentsService.unmatched.mockResolvedValue({ data: { data: [payment({})] } })
    paymentsService.refundUnmatched.mockResolvedValue({ status: 202, data: {} })
    render(<UnmatchedPayments />)

    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }))
    fireEvent.click(screen.getByRole('button', { name: /refund gh₵ 25\.50/i }))

    await waitFor(() => expect(paymentsService.refundUnmatched).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(paymentsService.unmatched).toHaveBeenCalledTimes(2)
  })
})
