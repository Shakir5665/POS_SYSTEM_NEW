import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InventoryPage from '../pages/InventoryPage'
import { inventoryService } from '../services/inventory'

vi.mock('../services/inventory', () => ({
  inventoryService: {
    list: vi.fn(),
    lowStock: vi.fn(),
    adjust: vi.fn(),
    restock: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'admin', full_name: 'Admin User', role: 'ADMIN' },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'GH₵',
  }),
}))

const mockInventoryProducts = [
  {
    id: 'prod-1',
    name: 'Basmati Rice',
    sku: 'RICE-BAS-1',
    barcode: '8901234567890',
    quantity: 15,
    low_stock_threshold: 5,
    price: '30.00',
    base_unit: 'kg',
    pricing_unit: 'kg',
    unit_category: 'WEIGHT',
  },
  {
    id: 'prod-2',
    name: 'Sunflower Oil',
    sku: 'OIL-SUN-1',
    barcode: '8909876543210',
    quantity: 2,
    low_stock_threshold: 5,
    price: '25.00',
    base_unit: 'L',
    pricing_unit: 'L',
    unit_category: 'VOLUME',
  },
]

describe('Batch 6: Inventory Product Search & Scanner Interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    inventoryService.list.mockResolvedValue({
      data: {
        data: mockInventoryProducts,
        meta: { page: 1, total_pages: 1, total: 2 },
      },
    })

    inventoryService.lowStock.mockResolvedValue({
      data: {
        data: [mockInventoryProducts[1]],
      },
    })
  })

  it('renders search input and product details including SKU and Barcode', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    expect(screen.getByPlaceholderText(/search by name, sku, or barcode/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Basmati Rice')).toBeInTheDocument()
      expect(screen.getByText('Sunflower Oil')).toBeInTheDocument()
    })

    // Check SKU and Barcode rendered
    expect(screen.getByText(/SKU: RICE-BAS-1/i)).toBeInTheDocument()
    expect(screen.getByText(/Barcode: 8901234567890/i)).toBeInTheDocument()
  })

  it('calls inventoryService.list with debounced search query when typing', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search by name, sku, or barcode/i)
    fireEvent.change(searchInput, { target: { value: '8901234567890' } })

    await waitFor(
      () => {
        expect(inventoryService.list).toHaveBeenCalledWith(
          expect.objectContaining({
            search: '8901234567890',
          })
        )
      },
      { timeout: 1000 }
    )
  })

  it('absorbs scanner Enter key down to prevent accidental submit', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search by name, sku, or barcode/i)
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const notPrevented = searchInput.dispatchEvent(enterEvent)

    // dispatchEvent returns false if event.preventDefault() was called
    expect(notPrevented).toBe(false)
  })

  it('passes search query to lowStock when active tab is low stock', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    const lowTab = screen.getByRole('button', { name: /low stock/i })
    fireEvent.click(lowTab)

    const searchInput = screen.getByPlaceholderText(/search by name, sku, or barcode/i)
    fireEvent.change(searchInput, { target: { value: 'Sunflower' } })

    await waitFor(
      () => {
        expect(inventoryService.lowStock).toHaveBeenCalledWith('Sunflower')
      },
      { timeout: 1000 }
    )
  })

  it('clears search when clear button is clicked', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    const searchInput = screen.getByPlaceholderText(/search by name, sku, or barcode/i)
    fireEvent.change(searchInput, { target: { value: 'Rice' } })

    const clearButton = await screen.findByTitle('Clear search')
    expect(clearButton).toBeInTheDocument()

    fireEvent.click(clearButton)
    expect(searchInput.value).toBe('')
  })
})
