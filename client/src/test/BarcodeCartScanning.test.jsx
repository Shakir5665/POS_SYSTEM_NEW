import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

// Mock dependencies before imports
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/products', () => ({
  productsService: {
    list: vi.fn(),
    categories: vi.fn(),
    byBarcode: vi.fn(),
  },
}))

vi.mock('../services/sales', () => ({
  salesService: {
    create: vi.fn(),
    getReceiptData: vi.fn(),
  },
}))

vi.mock('../services/customers', () => ({
  customersService: {
    list: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'cashier1', full_name: 'Ama Cashier', role: 'CASHIER' },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'GH₵',
    tax_rate: '0',
    store_name: 'NexTill Store',
  }),
}))

import toast from 'react-hot-toast'
import { productsService } from '../services/products'
import { customersService } from '../services/customers'
import { CartProvider } from '../context/CartContext'
import POSPage from '../pages/POSPage'

// Test catalog fixtures
const MOCK_PRODUCTS = [
  {
    id: 'prod-cola',
    name: 'Coca-Cola 500ml',
    sku: 'BEV-COLA-01',
    barcode: '12345678',
    price: 10.0,
    quantity: 5,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-biscuit',
    name: 'Richoco Biscuits 200g',
    sku: 'SNK-BIS-02',
    barcode: '87654321',
    price: 6.5,
    quantity: 10,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-zero',
    name: 'Out of Stock Soda',
    sku: 'BEV-ZERO-03',
    barcode: '00001111',
    price: 8.0,
    quantity: 0,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-limited',
    name: 'Limited Edition Juice',
    sku: 'BEV-LTD-04',
    barcode: '22223333',
    price: 12.0,
    quantity: 2,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-lz',
    name: 'Leading Zero Olive Oil',
    sku: 'OIL-LZ-05',
    barcode: '0012345678905',
    price: 25.0,
    quantity: 8,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
]

/**
 * Simulate a hardware keyboard-wedge scanner emitting rapid keystrokes followed by Enter.
 */
function simulateBarcodeScan(barcode) {
  let time = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => time)

  act(() => {
    for (const char of barcode) {
      time += 15 // 15ms < 35ms -> qualifies as hardware scanner
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }
    time += 15
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

function renderPOS() {
  return render(
    <BrowserRouter>
      <CartProvider>
        <POSPage />
      </CartProvider>
    </BrowserRouter>
  )
}

describe('Barcode-Based Product Lookup & Automatic Cart Addition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsService.list.mockResolvedValue({ data: { data: MOCK_PRODUCTS } })
    productsService.categories.mockResolvedValue({ data: { data: [] } })
    customersService.list.mockResolvedValue({ data: { data: [] } })
    productsService.byBarcode.mockImplementation(async (code) => {
      const p = MOCK_PRODUCTS.find((item) => item.barcode === code)
      if (p) return { data: { success: true, data: p } }
      const err = new Error('Product not found')
      err.response = { status: 404 }
      throw err
    })
  })

  it('scans a registered barcode, identifies the product, and automatically adds 1 unit to cart', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    simulateBarcodeScan('12345678')

    // Product should now be in the cart with quantity 1
    await waitFor(() => {
      const qtyInput = screen.getByTestId('cart-qty-prod-cola')
      expect(qtyInput).toBeDefined()
      expect(qtyInput.value).toBe('1')
    })

    expect(toast.success).toHaveBeenCalledWith('Coca-Cola 500ml added to cart', expect.any(Object))
  })

  it('scans the same product repeatedly, incrementing quantity by one each time without creating extra rows', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    // First scan -> qty 1
    simulateBarcodeScan('12345678')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1'))

    // Advance time beyond debounce window (300ms)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 500)

    // Second scan -> qty 2
    simulateBarcodeScan('12345678')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('2'))

    // Advance time again
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000)

    // Third scan -> qty 3
    simulateBarcodeScan('12345678')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('3'))

    // Ensure only 1 row exists for prod-cola
    const cartInputs = screen.getAllByTestId('cart-qty-prod-cola')
    expect(cartInputs.length).toBe(1)
  })

  it('adds an existing cart product when scanned, incrementing its quantity and recalculating totals', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Richoco Biscuits 200g')).toBeDefined())

    // Manually click product card to add to cart
    fireEvent.click(screen.getByText('Richoco Biscuits 200g'))
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-biscuit').value).toBe('1'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 500)

    // Now scan its barcode
    simulateBarcodeScan('87654321')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-biscuit').value).toBe('2'))
  })

  it('displays the exact specified error when an unknown barcode is scanned', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    simulateBarcodeScan('99999999')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Product not found. Please register the product or search manually.')
    })

    // Cart remains empty
    expect(screen.queryByTestId('cart-qty-prod-cola')).toBeNull()
  })

  it('rejects scanning a product with zero stock and displays an out-of-stock warning', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Out of Stock Soda')).toBeDefined())

    simulateBarcodeScan('00001111')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Out of Stock Soda is out of stock')
    })

    expect(screen.queryByTestId('cart-qty-prod-zero')).toBeNull()
  })

  it('enforces available stock limits and blocks scans when stock is exhausted', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Limited Edition Juice')).toBeDefined())

    // Scan 1 (available: 2) -> qty 1
    simulateBarcodeScan('22223333')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-limited').value).toBe('1'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 500)

    // Scan 2 -> qty 2
    simulateBarcodeScan('22223333')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-limited').value).toBe('2'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000)

    // Scan 3 -> stock limit reached (2)
    simulateBarcodeScan('22223333')
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Cannot add more. Only 2 pcs available in stock.')
    })

    // Quantity stays capped at 2
    expect(screen.getByTestId('cart-qty-prod-limited').value).toBe('2')
  })

  it('preserves leading zeros in barcode strings (e.g. 0012345678905)', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Leading Zero Olive Oil')).toBeDefined())

    simulateBarcodeScan('0012345678905')

    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-lz').value).toBe('1')
    })
  })

  it('scans multiple different products consecutively and computes cart totals accurately', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    // Scan Cola (price 10.0)
    simulateBarcodeScan('12345678')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1'))

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 500)

    // Scan Biscuit (price 6.5)
    simulateBarcodeScan('87654321')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-biscuit').value).toBe('1'))

    // Both items must exist in cart
    expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1')
    expect(screen.getByTestId('cart-qty-prod-biscuit').value).toBe('1')
  })

  it('supports barcode entry in search input when cashier presses Enter', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)
    fireEvent.change(searchInput, { target: { value: '12345678' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1')
    })

    // Search query is automatically cleared after adding
    expect(searchInput.value).toBe('')
  })

  it('debounces rapid duplicate scanner bounces within 250ms', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // First scan event
    simulateBarcodeScan('12345678')
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1'))

    // Rapid bounce event 50ms later with same barcode
    vi.spyOn(Date, 'now').mockReturnValue(now + 50)
    simulateBarcodeScan('12345678')

    // Quantity should still be 1 because it was debounced
    expect(screen.getByTestId('cart-qty-prod-cola').value).toBe('1')
  })
})
