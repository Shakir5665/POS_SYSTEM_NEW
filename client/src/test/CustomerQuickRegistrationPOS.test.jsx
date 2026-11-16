import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import POSPage from '../pages/POSPage'
import { CartProvider } from '../context/CartContext'
import { productsService } from '../services/products'
import { customersService } from '../services/customers'

vi.mock('../services/products', () => ({
  productsService: {
    list: vi.fn(),
    categories: vi.fn(),
    byBarcode: vi.fn(),
  },
}))

vi.mock('../services/customers', () => ({
  customersService: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('../services/sales', () => ({
  salesService: {
    create: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'cashier', full_name: 'Test Cashier', role: 'CASHIER' },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'LKR',
  }),
}))

const mockProducts = [
  {
    id: 'p1',
    name: 'Rice 5kg',
    sku: 'RICE-01',
    price: '50.00',
    usual_price: '50.00',
    our_price: '45.00',
    quantity: '20',
    unit_category: 'COUNT',
    base_unit: 'pcs',
    pricing_unit: 'pcs',
    low_stock_threshold: '5',
    is_active: true,
  },
]

describe('Batch 5: POS Customer Quick Registration & Credit Payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsService.list.mockResolvedValue({ data: { data: mockProducts } })
    productsService.categories.mockResolvedValue({ data: { data: [] } })
    customersService.list.mockResolvedValue({ data: { data: [] } })
  })

  it('renders quick register button and opens quick registration modal', async () => {
    render(
      <MemoryRouter>
        <CartProvider>
          <POSPage />
        </CartProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument()
    })

    const newBtn = screen.getByRole('button', { name: /new/i })
    expect(newBtn).toBeInTheDocument()
    fireEvent.click(newBtn)

    expect(screen.getByText('Quick Customer Registration')).toBeInTheDocument()
    expect(screen.getByLabelText(/Customer Full Name/i)).toBeInTheDocument()
  })

  it('registers a new customer and auto-selects them in POS', async () => {
    customersService.create.mockResolvedValue({
      data: {
        data: {
          id: 'cust-99',
          name: 'Ama Kofi',
          phone: '0241234567',
          loyalty_points: 0,
        },
      },
    })

    render(
      <MemoryRouter>
        <CartProvider>
          <POSPage />
        </CartProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument()
    })

    // Add item to cart first
    fireEvent.click(screen.getByText('Rice 5kg'))
    expect(screen.getAllByText(/1 distinct item/i)[0]).toBeInTheDocument()

    // Open quick registration
    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    // Fill details
    fireEvent.change(screen.getByLabelText(/Customer Full Name/i), { target: { value: 'Ama Kofi' } })
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '0241234567' } })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Register & Select/i }))

    await waitFor(() => {
      expect(customersService.create).toHaveBeenCalledWith({
        name: 'Ama Kofi',
        phone: '0241234567',
        email: undefined,
        address: undefined,
      })
    })

    // Verify newly registered customer is selected and cart remains intact
    await waitFor(() => {
      expect(screen.getByText('Ama Kofi')).toBeInTheDocument()
      expect(screen.getAllByText(/1 distinct item/i)[0]).toBeInTheDocument()
    })
  })
})
