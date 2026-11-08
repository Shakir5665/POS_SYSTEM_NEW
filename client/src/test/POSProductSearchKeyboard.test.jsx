import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

const MOCK_PRODUCTS = [
  {
    id: 'prod-cola',
    name: 'Coca-Cola 500ml',
    sku: 'BEV-COLA',
    barcode: '11112222',
    price: 10.0,
    usual_price: 12.0,
    our_price: 10.0,
    quantity: 5,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-cola-diet',
    name: 'Coca-Cola Diet 500ml',
    sku: 'BEV-COLA-DIET',
    barcode: '11113333',
    price: 11.0,
    usual_price: 13.0,
    our_price: 11.0,
    quantity: 8,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-sugar',
    name: 'White Sugar 1kg',
    sku: 'GROC-SUGAR-01',
    barcode: '44445555',
    price: 35.0,
    usual_price: 40.0,
    our_price: 35.0,
    quantity: 20,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-out',
    name: 'Out of Stock Coffee',
    sku: 'BEV-COF-OUT',
    barcode: '99990000',
    price: 25.0,
    usual_price: 30.0,
    our_price: 25.0,
    quantity: 0,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
]

function renderPOS() {
  return render(
    <BrowserRouter>
      <CartProvider>
        <POSPage />
      </CartProvider>
    </BrowserRouter>
  )
}

describe('Batch 2: POS Product Search & Keyboard Interaction', () => {
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

  it('filters product list as cashier types product name and adds with Enter key', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('White Sugar 1kg')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // Type "Sugar"
    fireEvent.change(searchInput, { target: { value: 'Sugar' } })

    // Sugar should be visible, others filtered out
    expect(screen.getByText('White Sugar 1kg')).toBeDefined()
    expect(screen.queryByText('Coca-Cola 500ml')).toBeNull()

    // Press Enter in search bar
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    // Product should be added to the cart
    await waitFor(() => {
      const qtyInput = screen.getByTestId('cart-qty-prod-sugar')
      expect(qtyInput).toBeDefined()
      expect(qtyInput.value).toBe('1')
    })
    expect(toast.success).toHaveBeenCalledWith('White Sugar 1kg added to cart', expect.any(Object))
  })

  it('searches product by SKU and adds to cart with Enter key', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola Diet 500ml')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // Type exact SKU
    fireEvent.change(searchInput, { target: { value: 'BEV-COLA-DIET' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      const qtyInput = screen.getByTestId('cart-qty-prod-cola-diet')
      expect(qtyInput).toBeDefined()
      expect(qtyInput.value).toBe('1')
    })
  })

  it('searches product by Barcode and adds to cart with Enter key', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // Type exact Barcode
    fireEvent.change(searchInput, { target: { value: '11112222' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      const qtyInput = screen.getByTestId('cart-qty-prod-cola')
      expect(qtyInput).toBeDefined()
      expect(qtyInput.value).toBe('1')
    })
  })

  it('prioritizes exact SKU match when multiple products share substring', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // "BEV-COLA" is an exact SKU match for Coca-Cola 500ml, even though Coca-Cola Diet contains "BEV-COLA-DIET"
    fireEvent.change(searchInput, { target: { value: 'BEV-COLA' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-cola')).toBeDefined()
      expect(screen.queryByTestId('cart-qty-prod-cola-diet')).toBeNull()
    })
  })

  it('allows keyboard navigation with ArrowDown and ArrowUp across matching results', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Coca-Cola 500ml')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // Type "Coca" -> matches both Coca-Cola (index 0) and Coca-Cola Diet (index 1)
    fireEvent.change(searchInput, { target: { value: 'Coca' } })

    // Arrow down to highlight the second product (Coca-Cola Diet)
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' })

    // Press Enter
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    // Coca-Cola Diet should be added to the cart
    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-cola-diet')).toBeDefined()
      expect(screen.queryByTestId('cart-qty-prod-cola')).toBeNull()
    })
  })

  it('prevents adding out of stock products via keyboard Enter', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Out of Stock Coffee')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    fireEvent.change(searchInput, { target: { value: 'Coffee' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    expect(toast.error).toHaveBeenCalledWith('Out of Stock Coffee is out of stock')
    expect(screen.queryByTestId('cart-qty-prod-out')).toBeNull()
  })

  it('continues to support mouse click selection on product cards', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('White Sugar 1kg')).toBeDefined())

    const productCard = screen.getByTestId('product-card-prod-sugar')
    fireEvent.click(productCard)

    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-sugar')).toBeDefined()
      expect(screen.getByTestId('cart-qty-prod-sugar').value).toBe('1')
    })
  })

  it('increments quantity when Enter is pressed multiple times consecutively', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('White Sugar 1kg')).toBeDefined())

    const searchInput = screen.getByPlaceholderText(/Search by name, SKU, or scan barcode/i)

    // 1st Enter -> Qty 1
    fireEvent.change(searchInput, { target: { value: 'Sugar' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-sugar').value).toBe('1'))

    // 2nd Enter -> Qty 2
    fireEvent.change(searchInput, { target: { value: 'Sugar' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-sugar').value).toBe('2'))
  })
})
