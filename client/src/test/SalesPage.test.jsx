import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../layouts/DashboardLayout', () => ({ DashboardLayout: ({ children }) => <div>{children}</div> }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../services/payments', () => ({ paymentsService: { unmatched: vi.fn().mockResolvedValue({ data: { data: [] } }), refundUnmatched: vi.fn() } }))
vi.mock('../services/sales', () => ({
  salesService: { list: vi.fn(), get: vi.fn(), refund: vi.fn() },
}))

import toast from 'react-hot-toast'
import { salesService } from '../services/sales'
import SalesPage from '../pages/SalesPage'

const sale = (overrides) => ({
  id: overrides.transaction_id,
  created_at: '2026-10-19T10:00:00Z',
  user: { full_name: 'Ama Cashier' },
  customer: null,
  payment_method: 'CASH',
  total_amount: '25',
  payment_status: 'COMPLETED',
  refund_requested_at: null,
  ...overrides,
})

const SALES = [
  sale({ transaction_id: 'TXN-1', payment_method: 'CASH' }),
  sale({ transaction_id: 'TXN-2', payment_method: 'CARD', refund_requested_at: '2026-10-19T11:00:00Z' }),
  sale({ transaction_id: 'TXN-3', payment_method: 'MOBILE_MONEY', payment_status: 'REFUNDED' }),
  sale({ transaction_id: 'TXN-4', payment_method: 'CARD' }),
]

const rowFor = async (txn) => (await screen.findByText(txn)).closest('tr')

beforeEach(() => {
  vi.clearAllMocks()
  salesService.list.mockResolvedValue({ data: { data: SALES, meta: { page: 1, total_pages: 1 } } })
})

describe('SalesPage', () => {
  it('shows each sale with its status, and Refund only where allowed', async () => {
    render(<SalesPage />)

    expect(within(await rowFor('TXN-1')).getByText('Completed')).toBeDefined()
    expect(within(await rowFor('TXN-2')).getByText('Refund pending')).toBeDefined()
    expect(within(await rowFor('TXN-3')).getByText('Refunded')).toBeDefined()

    expect(within(await rowFor('TXN-1')).queryByText('Refund')).not.toBeNull()
    expect(within(await rowFor('TXN-2')).queryByText('Refund')).toBeNull()
    expect(within(await rowFor('TXN-3')).queryByText('Refund')).toBeNull()
  })

  it('refunds a cash sale after confirmation and reloads the list', async () => {
    salesService.refund.mockResolvedValue({ status: 200, data: { data: {} } })
    render(<SalesPage />)

    fireEvent.click(within(await rowFor('TXN-1')).getByText('Refund'))
    expect(screen.getByText(/give the customer the amount in cash/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /refund gh₵ 25\.00/i }))

    await waitFor(() => expect(salesService.refund).toHaveBeenCalledWith('TXN-1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sale TXN-1 refunded'))
    expect(salesService.list).toHaveBeenCalledTimes(2)
  })

  it('tells the user a card refund is pending Paystack confirmation', async () => {
    salesService.refund.mockResolvedValue({ status: 202, data: { data: {} } })
    render(<SalesPage />)

    fireEvent.click(within(await rowFor('TXN-4')).getByText('Refund'))
    expect(screen.getByText(/paystack will return the amount/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /refund gh₵ 25\.00/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/paystack confirms/i)))
  })

  it('shows the server error when a refund fails', async () => {
    salesService.refund.mockRejectedValue({ response: { data: { error: { message: 'Paystack refused the refund' } } } })
    render(<SalesPage />)

    fireEvent.click(within(await rowFor('TXN-4')).getByText('Refund'))
    fireEvent.click(screen.getByRole('button', { name: /refund gh₵ 25\.00/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Paystack refused the refund'))
  })

  it('reloads from page 1 with the chosen date filter', async () => {
    render(<SalesPage />)
    await rowFor('TXN-1')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })

    await waitFor(() =>
      expect(salesService.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, start_date: '2026-10-01' }))
    )
  })
})
