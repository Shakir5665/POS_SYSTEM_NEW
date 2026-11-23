import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProductCategoriesPage from '../pages/ProductCategoriesPage'
import VariationsPage from '../pages/VariationsPage'
import BrandsPage from '../pages/BrandsPage'
import SalesPage from '../pages/SalesPage'
import SalesReturnsPage from '../pages/SalesReturnsPage'
import CreateSaleReturnPage from '../pages/CreateSaleReturnPage'
import { productsService } from '../services/products'
import { variationsService } from '../services/variations'
import { brandsService } from '../services/brands'
import { salesService } from '../services/sales'
import { returnsService } from '../services/returns'
import { warehouseService } from '../services/warehouses'

// Mock services
vi.mock('../services/products', () => ({
  productsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    categories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
}))

vi.mock('../services/variations', () => ({
  variationsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../services/brands', () => ({
  brandsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../services/sales', () => ({
  salesService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    refund: vi.fn(),
    payments: vi.fn(),
    voidPayment: vi.fn(),
    downloadPdf: vi.fn(),
  },
}))

vi.mock('../services/returns', () => ({
  returnsService: {
    getSaleEligibility: vi.fn(),
    createSalesReturn: vi.fn(),
    listSalesReturns: vi.fn(),
    getSalesReturn: vi.fn(),
    deleteSalesReturn: vi.fn(),
    downloadPdf: vi.fn(),
  },
}))

vi.mock('../services/warehouses', () => ({
  warehouseService: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', full_name: 'Test Admin', role: 'ADMIN' },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'LKR',
    site_title: 'NexTill POS',
  }),
}))

describe('Product Categories Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productsService.categories.mockResolvedValue({
      data: {
        data: [
          { id: 'cat-1', name: 'Beverages', description: 'Cold and hot drinks', product_count: 5 },
          { id: 'cat-2', name: 'Snacks', description: 'Crisps and snacks', product_count: 0 },
        ],
        meta: { page: 1, total_pages: 1, total: 2 },
      },
    })
  })

  it('renders categories list with product counts', async () => {
    render(
      <MemoryRouter>
        <ProductCategoriesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument()
      expect(screen.getByText('Snacks')).toBeInTheDocument()
      expect(screen.getByText('5 products')).toBeInTheDocument()
    })
  })

  it('opens create category modal and submits new category', async () => {
    productsService.createCategory.mockResolvedValue({
      data: { data: { id: 'cat-3', name: 'Dairy', description: 'Milk and cheese' } },
    })

    render(
      <MemoryRouter>
        <ProductCategoriesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument()
    })

    const headerCreateBtn = screen.getAllByRole('button', { name: /create category/i })[0]
    fireEvent.click(headerCreateBtn)

    expect(screen.getByText(/create product category/i)).toBeInTheDocument()
    const nameInput = screen.getByPlaceholderText(/e\.g\. Beverages, Electronics/i)
    fireEvent.change(nameInput, { target: { value: 'Dairy' } })

    const form = nameInput.closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(productsService.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dairy' })
      )
    })
  })

  it('shows warning when deleting category with linked products', async () => {
    render(
      <MemoryRouter>
        <ProductCategoriesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument()
    })

    const deleteBtn = screen.getAllByTitle('Delete Category')[0]
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(screen.getByText(/5 associated products/i)).toBeInTheDocument()
    })
  })
})

describe('Variations Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    variationsService.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'var-1',
            name: 'Size',
            values: [
              { id: 'val-1', value: 'Small' },
              { id: 'val-2', value: 'Medium' },
              { id: 'val-3', value: 'Large' },
            ],
          },
        ],
        meta: { page: 1, total_pages: 1, total: 1 },
      },
    })
  })

  it('renders variations list with value chips', async () => {
    render(
      <MemoryRouter>
        <VariationsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Size')).toBeInTheDocument()
      expect(screen.getByText('Small')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Large')).toBeInTheDocument()
    })
  })

  it('allows adding and removing value chips in create modal', async () => {
    variationsService.create.mockResolvedValue({
      data: { data: { id: 'var-2', name: 'Color', values: [{ value: 'Red' }] } },
    })

    render(
      <MemoryRouter>
        <VariationsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Size')).toBeInTheDocument()
    })

    const createBtn = screen.getAllByRole('button', { name: /create variation/i })[0]
    fireEvent.click(createBtn)

    const nameInput = screen.getByPlaceholderText(/e\.g\. Size, Color, Flavor/i)
    fireEvent.change(nameInput, { target: { value: 'Color' } })

    const valInput = screen.getByPlaceholderText(/Enter value \(e\.g\. Small\) and press Enter/i)
    fireEvent.change(valInput, { target: { value: 'Red' } })
    const addBtn = screen.getByRole('button', { name: /^add$/i })
    fireEvent.click(addBtn)

    expect(screen.getByText('Red')).toBeInTheDocument()

    const form = nameInput.closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(variationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Color',
          values: ['Red'],
        })
      )
    })
  })
})

describe('Brands Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brandsService.list.mockResolvedValue({
      data: {
        data: [
          { id: 'br-1', name: 'Nike', description: 'Athletic wear', product_count: 12 },
          { id: 'br-2', name: 'Adidas', description: 'Sportswear', product_count: 0 },
        ],
        meta: { page: 1, total_pages: 1, total: 2 },
      },
    })
  })

  it('renders brands list with product counts', async () => {
    render(
      <MemoryRouter>
        <BrandsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument()
      expect(screen.getByText('Adidas')).toBeInTheDocument()
      expect(screen.getByText('12 products')).toBeInTheDocument()
    })
  })

  it('creates brand successfully', async () => {
    brandsService.create.mockResolvedValue({
      data: { data: { id: 'br-3', name: 'Puma', description: 'Shoes' } },
    })

    render(
      <MemoryRouter>
        <BrandsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument()
    })

    const createBtn = screen.getAllByRole('button', { name: /create brand/i })[0]
    fireEvent.click(createBtn)

    const nameInput = screen.getByPlaceholderText(/e\.g\. Nike, Apple, Nestle, Samsung/i)
    fireEvent.change(nameInput, { target: { value: 'Puma' } })

    const form = nameInput.closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(brandsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Puma' })
      )
    })
  })
})

describe('SalesPage Enhancements', () => {
  const mockSale = {
    id: 'sale-1',
    transaction_id: 'TRX-1001',
    sale_date: '2026-11-20T10:00:00.000Z',
    created_at: '2026-11-20T10:00:00.000Z',
    total_amount: 1500,
    amount_paid: 1500,
    balance_due: 0,
    payment_method: 'CASH',
    payment_status: 'COMPLETED',
    is_cancelled: false,
    user: { full_name: 'John Cashier' },
    customer: { name: 'Alice Customer' },
    warehouse: { name: 'Main Branch' },
    items: [
      {
        id: 'si-1',
        product_id: 'prod-1',
        quantity: 2,
        unit_price: 750,
        discount_amount: 0,
        subtotal: 1500,
        returned_quantity: 0,
        product: { name: 'Classic T-Shirt', sku: 'TSHIRT-01' },
      },
    ],
    payments: [
      {
        id: 'pm-1',
        amount: 1500,
        payment_method: 'CASH',
        reference: 'CASH-001',
        created_at: '2026-11-20T10:00:00.000Z',
        is_void: false,
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    warehouseService.list.mockResolvedValue({ data: { data: [{ id: 'wh-1', name: 'Main Warehouse' }] } })
    salesService.list.mockResolvedValue({
      data: {
        data: [mockSale],
        meta: { page: 1, total_pages: 1 },
      },
    })
    salesService.get.mockResolvedValue({ data: { data: mockSale } })
    salesService.payments.mockResolvedValue({ data: { data: mockSale.payments } })
  })

  it('renders sales transactions table with 3-dots action menu', async () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('TRX-1001')).toBeInTheDocument()
    })

    const actionsBtn = screen.getByTitle('Actions')
    expect(actionsBtn).toBeInTheDocument()

    // Click 3-dots button to open menu
    fireEvent.click(actionsBtn)

    expect(screen.getByText('View Sale Details')).toBeInTheDocument()
    expect(screen.getByText('Print Receipt')).toBeInTheDocument()
    expect(screen.getByText('Download Invoice (A4)')).toBeInTheDocument()
    expect(screen.getByText('Download Invoice (A5)')).toBeInTheDocument()
    expect(screen.getByText('Edit Sale')).toBeInTheDocument()
    expect(screen.getByText('Process Return')).toBeInTheDocument()
    expect(screen.getByText('Cancel / Delete Sale')).toBeInTheDocument()
  })

  it('opens View Sale Details modal from 3-dots menu', async () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('TRX-1001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Actions'))
    fireEvent.click(screen.getByText('View Sale Details'))

    await waitFor(() => {
      expect(screen.getByText(/Sale Details: TRX-1001/i)).toBeInTheDocument()
      expect(screen.getByText('Classic T-Shirt')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /A4 Invoice PDF/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thermal Receipt/i })).toBeInTheDocument()
    })
  })

  it('downloads invoice PDF from 3-dots menu', async () => {
    salesService.downloadPdf.mockResolvedValue({ data: new Blob(['fake-pdf'], { type: 'application/pdf' }) })

    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('TRX-1001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Actions'))
    fireEvent.click(screen.getByText('Download Invoice (A4)'))

    await waitFor(() => {
      expect(salesService.downloadPdf).toHaveBeenCalledWith('sale-1', 'a4')
    })
  })

  it('opens Edit Sale modal from 3-dots menu and submits update', async () => {
    salesService.update.mockResolvedValue({ data: { message: 'Sale updated' } })

    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('TRX-1001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Actions'))
    fireEvent.click(screen.getByText('Edit Sale'))

    await waitFor(() => {
      expect(screen.getByText(/Edit Sale: TRX-1001/i)).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(salesService.update).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              product_id: 'prod-1',
              sale_item_id: 'si-1',
            }),
          ]),
        })
      )
    })
  })

  it('opens Cancel Sale modal from 3-dots menu and submits cancellation reason', async () => {
    salesService.delete.mockResolvedValue({ data: { message: 'Sale cancelled' } })

    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('TRX-1001')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Actions'))
    fireEvent.click(screen.getByText('Cancel / Delete Sale'))

    await waitFor(() => {
      expect(screen.getByText(/Cancel Sale: TRX-1001/i)).toBeInTheDocument()
      expect(screen.getByText(/Unreturned inventory will be returned to the warehouse/i)).toBeInTheDocument()
    })

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Customer cancelled order/i)
    fireEvent.change(reasonInput, { target: { value: 'Customer returned all goods' } })

    const confirmBtn = screen.getByRole('button', { name: /Confirm Cancellation/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(salesService.delete).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({ reason: 'Customer returned all goods' })
      )
    })
  })
})

describe('Sales Returns Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    warehouseService.list.mockResolvedValue({ data: { data: [] } })
    returnsService.listSalesReturns.mockResolvedValue({
      data: {
        data: [
          {
            id: 'ret-1',
            return_number: 'SR-0001',
            refund_amount: 500,
            refund_status: 'COMPLETED',
            created_at: '2026-11-20T10:00:00.000Z',
            customer: { name: 'Bob' },
            sale: { transaction_id: 'TRX-1001' },
          },
        ],
        meta: { page: 1, total_pages: 1, total: 1 },
      },
    })
  })

  it('renders sales returns list and action buttons', async () => {
    render(
      <MemoryRouter>
        <SalesReturnsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('SR-0001')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create sale return/i })).toBeInTheDocument()
    })
  })

  it('checks return eligibility and calculates refund in CreateSaleReturnPage', async () => {
    salesService.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'sale-1',
            transaction_id: 'TRX-1001',
            total_amount: 1500,
            sale_date: '2026-11-20T10:00:00.000Z',
            customer: { name: 'Alice Customer' },
          },
        ],
      },
    })

    returnsService.getSaleEligibility.mockResolvedValue({
      data: {
        data: {
          sale_id: 'sale-1',
          transaction_id: 'TRX-1001',
          items: [
            {
              sale_item_id: 'si-1',
              product_name: 'Blue Jeans',
              product_sku: 'JEANS-01',
              unit: 'pcs',
              sold_quantity: 2,
              already_returned: 0,
              remaining_eligible: 2,
              net_unit_price: 500,
            },
          ],
        },
      },
    })

    render(
      <MemoryRouter>
        <CreateSaleReturnPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create Sale Return/i })).toBeInTheDocument()
    })
  })
})
