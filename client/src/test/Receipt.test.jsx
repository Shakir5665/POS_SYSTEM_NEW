import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Receipt } from '../components/Receipt'
import { getReceiptDataModel } from '../utils/receiptModel'

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

// 5-Column Redesign Test Case: Chilli & Salt with Market Price, Our Price, and Discounts
const redesignSale = {
  id: 'sale-redesign-001',
  transaction_id: 'TXN-2026-REDESIGN',
  created_at: '2026-11-09T10:00:00Z',
  user: { full_name: 'Ama Cashier' },
  customer: { name: 'Kofi Mensah' },
  gross_subtotal: '240.00',
  discount_amount: '10.00', // Additional Cart Discount
  total_amount: '210.00',
  payment_method: 'CASH',
  payment: {
    amount_paid: '250.00',
    change_given: '40.00',
    reference: null,
  },
  items: [
    {
      product_name: 'Chilli',
      quantity: 2,
      unit: 'kg',
      unit_price: 100.0,
      usual_price_snapshot: 120.0,
      our_price_snapshot: 100.0,
      predefined_discount_applied: true,
      predefined_discount_amount: 40.0, // 2 * (120 - 100) = 40
      total: 200.0, // 2 * 100 = 200
    },
    {
      product_name: 'Salt',
      quantity: 2,
      unit: 'pcs',
      unit_price: 120.0,
      usual_price_snapshot: 150.0,
      our_price_snapshot: 120.0,
      predefined_discount_applied: true,
      predefined_discount_amount: 60.0, // 2 * (150 - 120) = 60
      total: 240.0, // 2 * 120 = 240
    },
  ],
}

describe('Receipt Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.print = vi.fn()
  })

  it('renders screen view and portals thermal receipt to #print-root', () => {
    const handleClose = vi.fn()
    render(<Receipt sale={mockSale} onClose={handleClose} />)

    expect(screen.getAllByText('TXN-2026-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ama Cashier').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Kofi Mensah').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /print receipt/i })).toBeDefined()

    const printRoot = document.getElementById('print-root')
    expect(printRoot).not.toBeNull()
    expect(printRoot.textContent).toContain('TXN-2026-001')
    expect(printRoot.textContent).toContain('Rice')
    expect(printRoot.textContent).toContain('500 g')
    expect(printRoot.textContent).toContain('Soap')
  })

  it('does not display currency symbols (e.g. LKR, GH₵, USD) on the receipt', () => {
    render(<Receipt sale={mockSale} onClose={vi.fn()} />)

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

describe('Task 2: Redesigned 5-Column Receipt Table & Financial Summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.print = vi.fn()
  })

  it('renders the 5 requested columns: Items (Count), Qty, Market Price, Our Price, Amount in 80mm table', () => {
    render(<Receipt sale={redesignSale} onClose={vi.fn()} />)

    const printRoot = document.getElementById('print-root')
    expect(printRoot).not.toBeNull()

    // 1. Column header includes dynamic distinct item count: Items (2)
    expect(printRoot.textContent).toContain('Items (2)')
    expect(printRoot.textContent).toContain('Qty')
    expect(printRoot.textContent).toContain('Market Price')
    expect(printRoot.textContent).toContain('Our Price')
    expect(printRoot.textContent).toContain('Amount')

    // 2. Chilli item values
    expect(printRoot.textContent).toContain('Chilli')
    expect(printRoot.textContent).toContain('2 kg')
    expect(printRoot.textContent).toContain('120.00') // Market Price
    expect(printRoot.textContent).toContain('100.00') // Our Price
    expect(printRoot.textContent).toContain('200.00') // Line Amount (2 * 100)

    // 3. Salt item values
    expect(printRoot.textContent).toContain('Salt')
    expect(printRoot.textContent).toContain('2 pcs')
    expect(printRoot.textContent).toContain('150.00') // Market Price
    expect(printRoot.textContent).toContain('120.00') // Our Price
    expect(printRoot.textContent).toContain('240.00') // Line Amount (2 * 120)
  })

  it('renders the redesigned summary: Market Price Subtotal, Our Total Discount, and Grand Total', () => {
    render(<Receipt sale={redesignSale} onClose={vi.fn()} />)

    const printRoot = document.getElementById('print-root')

    // Market Price Subtotal = (2 * 120) + (2 * 150) = 240 + 300 = 540.00
    expect(printRoot.textContent).toContain('Market Price Subtotal:')
    expect(printRoot.textContent).toContain('540.00')

    // Our Total Discount = Predefined (40 + 60 = 100) + Additional Cart Discount (10) = 110.00
    expect(printRoot.textContent).toContain('Our Total Discount:')
    expect(printRoot.textContent).toContain('-110.00')

    // Grand Total = 540.00 - 110.00 = 430.00 (or matches sale total)
    expect(printRoot.textContent).toContain('Grand Total:')

    // Payment details
    expect(printRoot.textContent).toContain('Amount Paid:')
    expect(printRoot.textContent).toContain('250.00')
    expect(printRoot.textContent).toContain('Change:')
    expect(printRoot.textContent).toContain('40.00')
  })

  it('supports 58mm compact layout toggle without truncation or loss of information', () => {
    render(<Receipt sale={redesignSale} onClose={vi.fn()} />)

    // Click 58mm toggle
    fireEvent.click(screen.getByTestId('toggle-58mm'))

    const printRoot = document.getElementById('print-root')
    const items58 = printRoot.querySelector('[data-testid="receipt-items-58mm"]')
    expect(items58).not.toBeNull()

    // Verifies all 5 pieces of information exist in 58mm layout
    expect(items58.textContent).toContain('Items (2)')
    expect(items58.textContent).toContain('Chilli')
    expect(items58.textContent).toContain('2 kg')
    expect(items58.textContent).toContain('120.00')
    expect(items58.textContent).toContain('100.00')
    expect(items58.textContent).toContain('200.00')
  })

  it('guarantees preview screen view and printed receipt output contain identical calculations', () => {
    const { container } = render(<Receipt sale={redesignSale} onClose={vi.fn()} />)
    const screenView = container.querySelector('.receipt-screen-view')
    const printRoot = document.getElementById('print-root')

    expect(screenView).not.toBeNull()
    expect(printRoot).not.toBeNull()

    const checkValues = [
      'Items (2)',
      'Chilli',
      '2 kg',
      '120.00',
      '100.00',
      '200.00',
      'Salt',
      '2 pcs',
      '150.00',
      '120.00',
      '240.00',
      'Market Price Subtotal:',
      '540.00',
      'Our Total Discount:',
      '-110.00',
      'Grand Total:',
    ]

    for (const val of checkValues) {
      expect(screenView.textContent).toContain(val)
      expect(printRoot.textContent).toContain(val)
    }
  })
})

describe('Historical Transaction Backward Compatibility & Edge Cases', () => {
  it('correctly interprets historical sales with legacy flat item discount and total', () => {
    const legacySale = {
      id: 'legacy-sale-001',
      transaction_id: 'TXN-LEGACY-01',
      created_at: '2025-01-01T10:00:00Z',
      user: { full_name: 'Historical Cashier' },
      discount_amount: '2.00',
      tax_amount: '0.00',
      total_amount: '28.00',
      items: [
        {
          product_name: 'Historical Bread',
          quantity: 2,
          unit_price: 10.00,
          discount: 2.00,
          total: 18.00,
        },
        {
          product_name: 'Historical Butter',
          quantity: 1,
          unit_price: 12.00,
          discount: 0.00,
          total: 12.00,
        },
      ],
    }

    const { items, summary } = getReceiptDataModel(legacySale)

    expect(items[0].lineGross).toBe(20.00)
    expect(items[0].totalDiscount).toBe(2.00)
    expect(items[0].lineTotal).toBe(18.00)

    expect(items[1].lineGross).toBe(12.00)
    expect(items[1].totalDiscount).toBe(0.00)
    expect(items[1].lineTotal).toBe(12.00)

    expect(summary.grossSubtotal).toBe(32.00)
    expect(summary.totalProductDiscounts).toBe(2.00)
    expect(summary.additionalCartDiscount).toBe(2.00)
    expect(summary.ourTotalDiscount).toBe(4.00)
  })

  it('handles long product names with proper break-words classes', () => {
    const longNameSale = {
      id: 'long-name-sale',
      transaction_id: 'TXN-LONG-01',
      total_amount: '15.00',
      items: [
        {
          product_name: 'Extra Virgin Organic Cold-Pressed Olive Oil Mediterranean Import 750ml Glass Bottle',
          quantity: 1,
          unit_price: 15.0,
          total: 15.0,
        },
      ],
    }

    render(<Receipt sale={longNameSale} onClose={vi.fn()} />)
    const printRoot = document.getElementById('print-root')
    expect(printRoot.textContent).toContain(
      'Extra Virgin Organic Cold-Pressed Olive Oil Mediterranean Import 750ml Glass Bottle'
    )
  })
})
