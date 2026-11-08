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

// Section 8 Test Case: Product discounts, cart discount, gross subtotal and final total
const section8Sale = {
  id: 'sale-sec-8',
  transaction_id: 'TXN-SEC8-999',
  created_at: '2026-11-07T14:30:00Z',
  user: { full_name: 'Cashier Sarah' },
  customer: { name: 'Retail Customer' },
  gross_subtotal: '54.00',
  total_product_discounts: '32.00',
  discount_amount: '5.00', // Additional Cart Discount
  total_discounts: '37.00',
  tax_amount: '0.00',
  total_amount: '17.00',
  payment_method: 'CASH',
  payment: {
    amount_paid: '20.00',
    change_given: '3.00',
    reference: null,
  },
  items: [
    {
      product_name: 'Supermalt 330ml',
      quantity: 5,
      unit: 'pcs',
      unit_price: 6.00,
      unit_discount: 2.00,
      total_discount: 10.00,
      total: 20.00,
    },
    {
      product_name: 'Sunlight Dish Liquid',
      quantity: 1,
      unit: 'pcs',
      unit_price: 8.00,
      unit_discount: 6.00,
      total_discount: 6.00,
      total: 2.00,
    },
    {
      product_name: 'Vaseline Lotion',
      quantity: 2,
      unit: 'pcs',
      unit_price: 20.00,
      unit_discount: 8.00,
      total_discount: 16.00,
      total: 24.00,
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

describe('Section 8 Example Calculation: Preview & Print Parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.print = vi.fn()
  })

  it('renders all product breakdowns, discounts, and totals matching Section 8 specifications', () => {
    render(<Receipt sale={section8Sale} onClose={vi.fn()} />)

    const printRoot = document.getElementById('print-root')
    expect(printRoot).not.toBeNull()

    // 1. Supermalt 330ml
    // Qty: 5, Unit Price: 6.00, Unit Discount: 2.00, Total Disc: 10.00, Line Total: 20.00
    expect(printRoot.textContent).toContain('Supermalt 330ml')
    expect(printRoot.textContent).toContain('5 pcs × 6.00')
    expect(printRoot.textContent).toContain('30.00') // Line Gross
    expect(printRoot.textContent).toContain('Discount (2.00 × 5):')
    expect(printRoot.textContent).toContain('-10.00')
    expect(printRoot.textContent).toContain('20.00')

    // 2. Sunlight Dish Liquid
    // Qty: 1, Unit Price: 8.00, Unit Discount: 6.00, Total Disc: 6.00, Line Total: 2.00
    expect(printRoot.textContent).toContain('Sunlight Dish Liquid')
    expect(printRoot.textContent).toContain('1 pcs × 8.00')
    expect(printRoot.textContent).toContain('Discount (6.00 × 1):')
    expect(printRoot.textContent).toContain('-6.00')
    expect(printRoot.textContent).toContain('2.00')

    // 3. Vaseline Lotion
    // Qty: 2, Unit Price: 20.00, Unit Discount: 8.00, Total Disc: 16.00, Line Total: 24.00
    expect(printRoot.textContent).toContain('Vaseline Lotion')
    expect(printRoot.textContent).toContain('2 pcs × 20.00')
    expect(printRoot.textContent).toContain('40.00') // Line Gross
    expect(printRoot.textContent).toContain('Discount (8.00 × 2):')
    expect(printRoot.textContent).toContain('-16.00')
    expect(printRoot.textContent).toContain('24.00')

    // Summary breakdown
    // Gross Subtotal: 54.00
    expect(printRoot.textContent).toContain('Gross Subtotal:')
    expect(printRoot.textContent).toContain('54.00')

    // Total Product Discounts: 32.00
    expect(printRoot.textContent).toContain('Total Product Discounts:')
    expect(printRoot.textContent).toContain('-32.00')

    // Additional Cart Discount: 5.00
    expect(printRoot.textContent).toContain('Additional Cart Discount:')
    expect(printRoot.textContent).toContain('-5.00')

    // Total Discounts: 37.00
    expect(printRoot.textContent).toContain('Total Discounts:')
    expect(printRoot.textContent).toContain('37.00')

    // Grand Total: 17.00
    expect(printRoot.textContent).toContain('Grand Total:')
    expect(printRoot.textContent).toContain('17.00')

    // Payment method & cash amounts
    expect(printRoot.textContent).toContain('CASH')
    expect(printRoot.textContent).toContain('20.00') // Paid
    expect(printRoot.textContent).toContain('3.00')  // Change
  })

  it('guarantees preview screen view and printed receipt output contain identical calculations', () => {
    const { container } = render(<Receipt sale={section8Sale} onClose={vi.fn()} />)
    const screenView = container.querySelector('.receipt-screen-view')
    const printRoot = document.getElementById('print-root')

    expect(screenView).not.toBeNull()
    expect(printRoot).not.toBeNull()

    // Both views must have identical financial values
    const checkValues = [
      '54.00', // Gross subtotal
      '-32.00', // Product discounts
      '-5.00', // Cart discount
      '37.00', // Total discounts
      '17.00', // Final total
      '20.00', // Line total & amount paid
      '2.00', // Line total Sunlight
      '24.00', // Line total Vaseline
      '-10.00', // Discount Supermalt
      '-6.00', // Discount Sunlight
      '-16.00', // Discount Vaseline
      '3.00', // Change
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
      discount_amount: '2.00', // Legacy cart discount
      tax_amount: '0.00',
      total_amount: '28.00',
      items: [
        {
          product_name: 'Historical Bread',
          quantity: 2,
          unit_price: 10.00,
          discount: 2.00, // Legacy total line discount: 2 * 10 - 2 = 18.00
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

    // Bread: gross 20.00, line discount 2.00, unit discount 1.00, total 18.00
    expect(items[0].lineGross).toBe(20.00)
    expect(items[0].totalDiscount).toBe(2.00)
    expect(items[0].unitDiscount).toBe(1.00)
    expect(items[0].lineTotal).toBe(18.00)

    // Butter: gross 12.00, no discount
    expect(items[1].lineGross).toBe(12.00)
    expect(items[1].totalDiscount).toBe(0.00)
    expect(items[1].lineTotal).toBe(12.00)

    // Summary
    expect(summary.grossSubtotal).toBe(32.00)
    expect(summary.totalProductDiscounts).toBe(2.00)
    expect(summary.additionalCartDiscount).toBe(2.00)
    expect(summary.totalDiscounts).toBe(4.00)
    expect(summary.finalTotal).toBe(28.00)
  })

  it('prevents double discounting and maintains non-negative line totals', () => {
    const saleEdge = {
      id: 'edge-01',
      transaction_id: 'TXN-EDGE-01',
      items: [
        {
          product_name: 'Over-discounted Item',
          quantity: 2,
          unit_price: 5.00,
          unit_discount: 6.00, // Discount higher than unit price
        },
      ],
    }

    const { items } = getReceiptDataModel(saleEdge)
    // Gross: 10.00. Total discount is capped at gross (10.00), line total cannot be negative.
    expect(items[0].lineGross).toBe(10.00)
    expect(items[0].lineTotal).toBe(0.00)
    expect(items[0].totalDiscount).toBe(10.00)
  })

  it('handles long product names with proper wrapping classes for 58mm & 80mm printers', () => {
    const longNameSale = {
      id: 'long-name-sale',
      transaction_id: 'TXN-LONG-01',
      total_amount: '15.00',
      items: [
        {
          product_name: 'Extra Virgin Organic Cold-Pressed Olive Oil Mediterranean Import 750ml Glass Bottle',
          quantity: 1,
          unit_price: 15.00,
          total: 15.00,
        },
      ],
    }

    render(<Receipt sale={longNameSale} onClose={vi.fn()} />)
    const printRoot = document.getElementById('print-root')
    expect(printRoot.textContent).toContain('Extra Virgin Organic Cold-Pressed Olive Oil Mediterranean Import 750ml Glass Bottle')

    const longNameEl = screen.getAllByText(/Extra Virgin Organic Cold-Pressed Olive Oil/i)[0]
    expect(longNameEl.className).toContain('break-words')
  })
})
