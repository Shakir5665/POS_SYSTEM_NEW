import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Receipt } from '../components/Receipt'

const mockSale = {
  id: 'sale-123',
  transaction_id: 'TXN-2026-001',
  created_at: '2026-11-07T12:00:00Z',
  user: { full_name: 'Ama Cashier' },
  customer: { name: 'Kofi Mensah' },
  subtotal: '25.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  total_amount: '25.00',
  payment_method: 'CASH',
  payment: {
    amount_paid: '30.00',
    change_given: '5.00',
    reference: null,
  },
  items: [
    {
      product_name: 'Rice',
      quantity: '500',
      unit: 'g',
      unit_price: '20.00',
      total: '10.00',
    },
    {
      product_name: 'Soap',
      quantity: '1',
      unit: 'pcs',
      unit_price: '15.00',
      total: '15.00',
    },
  ],
}

describe('Receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.print = vi.fn()
  })

  it('renders screen view and portals thermal receipt to #print-root', () => {
    const handleClose = vi.fn()
    render(<Receipt sale={mockSale} onClose={handleClose} />)

    // Verify screen view elements exist
    expect(screen.getAllByText('TXN-2026-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ama Cashier').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Kofi Mensah').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /print receipt/i })).toBeDefined()

    // Verify portal #print-root exists and contains receipt items
    const printRoot = document.getElementById('print-root')
    expect(printRoot).not.toBeNull()
    expect(printRoot.textContent).toContain('TXN-2026-001')
    expect(printRoot.textContent).toContain('Rice')
    expect(printRoot.textContent).toContain('500 g')
    expect(printRoot.textContent).toContain('Soap')
  })

  it('does not display currency symbols (e.g. LKR, GH₵, USD) on the receipt', () => {
    const handleClose = vi.fn()
    render(<Receipt sale={mockSale} onClose={handleClose} />)

    const printRoot = document.getElementById('print-root')
    expect(printRoot.textContent).not.toContain('LKR')
    expect(printRoot.textContent).not.toContain('GH₵')
    expect(printRoot.textContent).not.toContain('USD')
    expect(printRoot.textContent).toContain('25.00')
    expect(printRoot.textContent).toContain('10.00')
    expect(printRoot.textContent).toContain('15.00')
    expect(printRoot.textContent).toContain('30.00')
    expect(printRoot.textContent).toContain('5.00')
  })

  it('triggers window.print() when Print Receipt button is clicked', () => {
    render(<Receipt sale={mockSale} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /print receipt/i }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Close button is clicked', () => {
    const handleClose = vi.fn()
    render(<Receipt sale={mockSale} onClose={handleClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
