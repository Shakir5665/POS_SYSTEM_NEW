import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SuppliersPage from '../pages/SuppliersPage'
import PurchasesPage from '../pages/PurchasesPage'
import { suppliersService } from '../services/suppliers'
import { purchasesService } from '../services/purchases'
import { productsService } from '../services/products'

vi.mock('../services/suppliers', () => ({
  suppliersService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    recordPayment: vi.fn(),
    statement: vi.fn(),
  },
}))

vi.mock('../services/purchases', () => ({
  purchasesService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    receive: vi.fn(),
    cancel: vi.fn(),
  },
}))

vi.mock('../services/products', () => ({
  productsService: {
    list: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'manager', full_name: 'Store Manager', role: 'MANAGER' },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'GH₵',
  }),
}))

const mockSuppliers = [
  {
    id: 'sup-1',
    name: 'Ghana Agro Wholesalers',
    phone: '0241112233',
    email: 'info@ghanaagro.com',
    contact_person: 'Kofi Mensah',
    address: 'Accra Central',
    is_active: true,
    outstanding_debt: 850.0,
    _count: { purchases: 3 },
  },
  {
    id: 'sup-2',
    name: 'Volta Beverages Depot',
    phone: '0209998877',
    email: 'orders@voltabev.com',
    contact_person: 'Ama Serwaa',
    address: 'Ho Regional Store',
    is_active: true,
    outstanding_debt: 0.0,
    _count: { purchases: 1 },
  },
]

const mockPurchases = [
  {
    id: 'po-1',
    purchase_number: 'PO-20261109-0001',
    supplier_id: 'sup-1',
    supplier: { id: 'sup-1', name: 'Ghana Agro Wholesalers', phone: '0241112233' },
    status: 'ORDERED',
    payment_status: 'PENDING',
    total_amount: '1200.00',
    amount_paid: '0.00',
    balance_due: '1200.00',
    created_at: new Date().toISOString(),
    items: [
      { id: 'item-1', product_name: 'Jasmine Rice 5kg', quantity: 20, unit: 'pcs', unit_cost: '60.00', total_cost: '1200.00' },
    ],
  },
  {
    id: 'po-2',
    purchase_number: 'PO-20261109-0002',
    supplier_id: 'sup-2',
    supplier: { id: 'sup-2', name: 'Volta Beverages Depot', phone: '0209998877' },
    status: 'RECEIVED',
    payment_status: 'COMPLETED',
    total_amount: '500.00',
    amount_paid: '500.00',
    balance_due: '0.00',
    created_at: new Date().toISOString(),
    items: [
      { id: 'item-2', product_name: 'Malt Drink (Crates)', quantity: 10, unit: 'box', unit_cost: '50.00', total_cost: '500.00' },
    ],
  },
]

describe('Batch 7: Suppliers and Purchases Frontend UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    suppliersService.list.mockResolvedValue({
      data: {
        data: mockSuppliers,
        meta: { page: 1, total_pages: 1, total: 2 },
      },
    })

    purchasesService.list.mockResolvedValue({
      data: {
        data: mockPurchases,
        meta: { page: 1, total_pages: 1, total: 2 },
      },
    })

    productsService.list.mockResolvedValue({
      data: {
        data: [
          { id: 'p1', name: 'Jasmine Rice 5kg', sku: 'RICE-01', base_unit: 'pcs', cost_price: '50.00' },
        ],
      },
    })
  })

  it('renders SuppliersPage with metrics, suppliers list, and pay debt button for indebted supplier', async () => {
    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: /suppliers/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Ghana Agro Wholesalers')).toBeInTheDocument()
      expect(screen.getByText('Volta Beverages Depot')).toBeInTheDocument()
    })

    // Supplier 1 has debt, should have Pay Debt button
    const payDebtBtn = screen.getByRole('button', { name: /pay debt/i })
    expect(payDebtBtn).toBeInTheDocument()

    // Supplier 2 has 0 debt -> Nil
    expect(screen.getByText('Nil')).toBeInTheDocument()
  })

  it('opens supplier statement modal and displays statement summary and ledger', async () => {
    suppliersService.statement.mockResolvedValue({
      data: {
        data: {
          supplier: mockSuppliers[0],
          statement: [
            {
              date: new Date().toISOString(),
              reference: 'PO-20261109-0001',
              description: 'Inventory Purchase Order',
              debit: 1200,
              credit: 0,
              running_balance: 1200,
            },
            {
              date: new Date().toISOString(),
              reference: 'PMT-001',
              description: 'Payment to Supplier via CASH',
              debit: 0,
              credit: 350,
              running_balance: 850,
            },
          ],
          summary: {
            total_purchased: 1200,
            total_paid: 350,
            current_balance: 850,
          },
        },
      },
    })

    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Ghana Agro Wholesalers')).toBeInTheDocument()
    })

    const statementBtns = screen.getAllByRole('button', { name: /statement/i })
    fireEvent.click(statementBtns[0])

    await waitFor(() => {
      expect(screen.getByText(/statement of account: ghana agro wholesalers/i)).toBeInTheDocument()
      expect(screen.getByText(/total invoiced/i)).toBeInTheDocument()
      expect(screen.getByText(/total settled/i)).toBeInTheDocument()
    })
  })

  it('records supplier debt repayment via repayment modal', async () => {
    suppliersService.recordPayment.mockResolvedValue({
      data: { success: true },
    })

    render(
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Ghana Agro Wholesalers')).toBeInTheDocument()
    })

    const payDebtBtn = screen.getByRole('button', { name: /pay debt/i })
    fireEvent.click(payDebtBtn)

    expect(screen.getByRole('heading', { name: /pay supplier debt/i })).toBeInTheDocument()

    const submitPaymentBtn = screen.getByRole('button', { name: /record payment/i })
    fireEvent.click(submitPaymentBtn)

    await waitFor(() => {
      expect(suppliersService.recordPayment).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({
          amount: 850,
          payment_method: 'CASH',
        })
      )
    })
  })

  it('renders PurchasesPage with purchase orders and receives ordered goods', async () => {
    purchasesService.receive.mockResolvedValue({
      data: { success: true },
    })

    render(
      <MemoryRouter>
        <PurchasesPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: /purchases/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('PO-20261109-0001')).toBeInTheDocument()
      expect(screen.getByText('PO-20261109-0002')).toBeInTheDocument()
    })

    // Order 1 is ORDERED, so it has "Receive Goods" button
    const receiveBtn = screen.getByRole('button', { name: /receive goods/i })
    fireEvent.click(receiveBtn)

    await waitFor(() => {
      expect(purchasesService.receive).toHaveBeenCalledWith('po-1')
    })
  })
})
