import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

// Mock dependencies
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
    currency_symbol: 'LKR',
    tax_rate: '0',
    store_name: 'NexTill Store',
  }),
}))

import { productsService } from '../services/products'
import { customersService } from '../services/customers'
import { CartProvider } from '../context/CartContext'
import POSPage from '../pages/POSPage'

const MOCK_PRODUCTS = [
  {
    id: 'prod-chilli',
    name: 'Chilli Powder',
    sku: 'SPICE-CHILLI',
    barcode: '1001',
    price: 100.0,
    usual_price: 120.0,
    our_price: 100.0,
    quantity: 50,
    unit_category: 'WEIGHT',
    base_unit: 'kg',
    pricing_unit: 'kg',
    is_active: true,
  },
  {
    id: 'prod-salt',
    name: 'Iodized Salt',
    sku: 'SPICE-SALT',
    barcode: '1002',
    price: 120.0,
    usual_price: 150.0,
    our_price: 120.0,
    quantity: 50,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-sugar',
    name: 'Refined Sugar',
    sku: 'GROC-SUGAR',
    barcode: '1003',
    price: 80.0,
    usual_price: 90.0,
    our_price: 80.0,
    quantity: 50,
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-rice',
    name: 'Jasmine Rice',
    sku: 'GROC-RICE',
    barcode: '1004',
    price: 200.0,
    usual_price: 220.0,
    our_price: 200.0,
    quantity: 50,
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

describe('Task 1: POS Cart Quantity Keyboard Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsService.list.mockResolvedValue({ data: { data: MOCK_PRODUCTS } })
    productsService.categories.mockResolvedValue({ data: { data: [] } })
    customersService.list.mockResolvedValue({ data: { data: [] } })
  })

  it('navigates sequentially through quantity inputs on Enter, reaching Additional Cart Discount on the last item', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Chilli Powder')).toBeDefined())

    // Add 4 products to cart
    fireEvent.click(screen.getByTestId('product-card-prod-chilli'))
    fireEvent.click(screen.getByTestId('product-card-prod-salt'))
    fireEvent.click(screen.getByTestId('product-card-prod-sugar'))
    fireEvent.click(screen.getByTestId('product-card-prod-rice'))

    await waitFor(() => {
      expect(screen.getByTestId('cart-qty-prod-chilli')).toBeDefined()
      expect(screen.getByTestId('cart-qty-prod-salt')).toBeDefined()
      expect(screen.getByTestId('cart-qty-prod-sugar')).toBeDefined()
      expect(screen.getByTestId('cart-qty-prod-rice')).toBeDefined()
    })

    const chilliQty = screen.getByTestId('cart-qty-prod-chilli')
    const saltQty = screen.getByTestId('cart-qty-prod-salt')
    const sugarQty = screen.getByTestId('cart-qty-prod-sugar')
    const riceQty = screen.getByTestId('cart-qty-prod-rice')
    const additionalDiscount = screen.getByTestId('additional-cart-discount-input')

    // 1. Focus Chilli, enter quantity 2 and press Enter
    chilliQty.focus()
    fireEvent.change(chilliQty, { target: { value: '2' } })
    fireEvent.keyDown(chilliQty, { key: 'Enter' })

    // -> Focus should move to Salt Quantity
    expect(document.activeElement).toBe(saltQty)

    // 2. Salt quantity, press Enter
    fireEvent.change(saltQty, { target: { value: '3' } })
    fireEvent.keyDown(saltQty, { key: 'Enter' })

    // -> Focus should move to Sugar Quantity
    expect(document.activeElement).toBe(sugarQty)

    // 3. Sugar quantity, press Enter
    fireEvent.change(sugarQty, { target: { value: '1' } })
    fireEvent.keyDown(sugarQty, { key: 'Enter' })

    // -> Focus should move to Rice Quantity
    expect(document.activeElement).toBe(riceQty)

    // 4. Rice quantity (LAST item in cart), press Enter
    fireEvent.change(riceQty, { target: { value: '4' } })
    fireEvent.keyDown(riceQty, { key: 'Enter' })

    // -> Focus MUST now move to Additional Cart Discount
    expect(document.activeElement).toBe(additionalDiscount)

    // 5. In Additional Cart Discount, press Enter
    fireEvent.keyDown(additionalDiscount, { key: 'Enter' })

    // -> Payment modal should open, focusing the Amount Paid input
    await waitFor(() => {
      const amountPaidInput = screen.getByTestId('amount-paid-input')
      expect(amountPaidInput).toBeDefined()
      expect(document.activeElement).toBe(amountPaidInput)
    })
  })

  it('navigates directly from single item quantity to Additional Cart Discount when cart has only 1 product', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Chilli Powder')).toBeDefined())

    // Add only 1 product
    fireEvent.click(screen.getByTestId('product-card-prod-chilli'))

    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-chilli')).toBeDefined())

    const chilliQty = screen.getByTestId('cart-qty-prod-chilli')
    const additionalDiscount = screen.getByTestId('additional-cart-discount-input')

    chilliQty.focus()
    fireEvent.keyDown(chilliQty, { key: 'Enter' })

    // Because Chilli is the only (and last) item, focus moves straight to Additional Cart Discount
    expect(document.activeElement).toBe(additionalDiscount)
  })

  it('supports editing a middle product quantity and advancing to the subsequent item', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Chilli Powder')).toBeDefined())

    fireEvent.click(screen.getByTestId('product-card-prod-chilli'))
    fireEvent.click(screen.getByTestId('product-card-prod-salt'))
    fireEvent.click(screen.getByTestId('product-card-prod-sugar'))

    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-salt')).toBeDefined())

    const saltQty = screen.getByTestId('cart-qty-prod-salt')
    const sugarQty = screen.getByTestId('cart-qty-prod-sugar')

    // Click directly into middle item (Salt)
    saltQty.focus()
    fireEvent.change(saltQty, { target: { value: '5' } })
    fireEvent.keyDown(saltQty, { key: 'Enter' })

    // Advance to Sugar
    expect(document.activeElement).toBe(sugarQty)
  })

  it('supports ArrowDown and ArrowUp navigation across quantity fields', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Chilli Powder')).toBeDefined())

    fireEvent.click(screen.getByTestId('product-card-prod-chilli'))
    fireEvent.click(screen.getByTestId('product-card-prod-salt'))

    await waitFor(() => expect(screen.getByTestId('cart-qty-prod-salt')).toBeDefined())

    const chilliQty = screen.getByTestId('cart-qty-prod-chilli')
    const saltQty = screen.getByTestId('cart-qty-prod-salt')

    chilliQty.focus()
    fireEvent.keyDown(chilliQty, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(saltQty)

    fireEvent.keyDown(saltQty, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(chilliQty)
  })

  it('shows an editable our-price field on the cart line', async () => {
    renderPOS()
    await waitFor(() => expect(screen.getByText('Chilli Powder')).toBeDefined())

    fireEvent.click(screen.getByTestId('product-card-prod-chilli'))
    await waitFor(() => expect(screen.getByTestId('cart-our-price-prod-chilli')).toBeDefined())

    const priceInput = screen.getByTestId('cart-our-price-prod-chilli')
    expect(priceInput.value).toBe('100')
    fireEvent.change(priceInput, { target: { value: '90' } })
    expect(priceInput.value).toBe('90')
  })
})
