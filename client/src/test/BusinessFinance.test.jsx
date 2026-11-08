import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FinancePage from '../pages/FinancePage'
import { financeService } from '../services/finance'

vi.mock('../services/finance', () => ({
  financeService: {
    summary: vi.fn(),
    categories: vi.fn(),
    createCategory: vi.fn(),
    expenses: vi.fn(),
    createExpense: vi.fn(),
    deleteExpense: vi.fn(),
    assets: vi.fn(),
    getAsset: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
    ownerTransactions: vi.fn(),
    createOwnerTransaction: vi.fn(),
  },
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'admin', full_name: 'Store Owner', role: 'ADMIN' },
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'GH₵',
  }),
}))

const mockSummary = {
  total_expenses: 1250.0,
  total_asset_value: 8500.0,
  total_contributions: 15000.0,
  total_withdrawals: 2000.0,
  net_capital: 13000.0,
  total_supplier_payables: 1800.0,
  total_customer_receivables: 950.0,
}

const mockCategories = [
  { id: 'cat-1', name: 'Rent', description: 'Premises' },
  { id: 'cat-2', name: 'Utilities', description: 'Power and water' },
]

const mockExpenses = [
  {
    id: 'exp-1',
    amount: '400.00',
    payment_method: 'CASH',
    expense_date: new Date().toISOString(),
    payee: 'City Power Corp',
    notes: 'Electricity bill',
    category: { id: 'cat-2', name: 'Utilities' },
  },
]

const mockAssets = [
  {
    id: 'ast-1',
    name: 'Industrial Display Freezer',
    asset_code: 'AST-FRZ-01',
    category: 'Equipment',
    acquisition_cost: '4500.00',
    current_value: '4200.00',
    status: 'ACTIVE',
    location: 'Aisle 3',
  },
]

const mockOwnerTransactions = [
  {
    id: 'ot-1',
    type: 'CONTRIBUTION',
    amount: '15000.00',
    payment_method: 'CARD',
    transaction_date: new Date().toISOString(),
    notes: 'Initial Capital Injection',
  },
  {
    id: 'ot-2',
    type: 'WITHDRAWAL',
    amount: '2000.00',
    payment_method: 'CASH',
    transaction_date: new Date().toISOString(),
    notes: 'Owner Drawings',
  },
]

describe('Batch 8: Business Finance Frontend UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    financeService.summary.mockResolvedValue({
      data: { data: mockSummary },
    })

    financeService.categories.mockResolvedValue({
      data: { data: mockCategories },
    })

    financeService.expenses.mockResolvedValue({
      data: {
        data: mockExpenses,
        meta: { page: 1, total_pages: 1, total: 1, total_expenses_amount: 400.0 },
      },
    })

    financeService.assets.mockResolvedValue({
      data: {
        data: mockAssets,
        meta: { page: 1, total_pages: 1, total: 1, total_current_value: 4200.0 },
      },
    })

    financeService.ownerTransactions.mockResolvedValue({
      data: {
        data: mockOwnerTransactions,
        meta: {
          page: 1,
          total_pages: 1,
          total: 2,
          summary: {
            total_contributions: 15000.0,
            total_withdrawals: 2000.0,
            net_owner_equity: 13000.0,
          },
        },
      },
    })
  })

  it('renders FinancePage with overview summary metrics', async () => {
    render(
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: /business finance management/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/total operating expenses/i)).toBeInTheDocument()
      expect(screen.getByText(/business assets valuation/i)).toBeInTheDocument()
      expect(screen.getAllByText(/net owner capital/i)[0]).toBeInTheDocument()
      expect(screen.getByText(/outstanding payables/i)).toBeInTheDocument()
    })
  })

  it('switches to Operating Expenses tab and opens record expense modal', async () => {
    render(
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>
    )

    const expensesTab = screen.getByRole('button', { name: /operating expenses/i })
    fireEvent.click(expensesTab)

    await waitFor(() => {
      expect(screen.getByText('City Power Corp')).toBeInTheDocument()
    })

    const recordBtn = screen.getByRole('button', { name: /\+ record expense/i })
    fireEvent.click(recordBtn)

    expect(screen.getByRole('heading', { name: /record operating expense/i })).toBeInTheDocument()
  })

  it('switches to Business Assets tab and displays assets with valuation', async () => {
    render(
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>
    )

    const assetsTab = screen.getByRole('button', { name: /business assets/i })
    fireEvent.click(assetsTab)

    await waitFor(() => {
      expect(screen.getByText('Industrial Display Freezer')).toBeInTheDocument()
      expect(screen.getByText('AST-FRZ-01')).toBeInTheDocument()
      expect(screen.getByText('Equipment')).toBeInTheDocument()
    })
  })

  it('switches to Owner Capital & Drawings tab and displays capital summary and transactions', async () => {
    render(
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>
    )

    const equityTab = screen.getByRole('button', { name: /owner capital & drawings/i })
    fireEvent.click(equityTab)

    await waitFor(() => {
      expect(screen.getByText(/total owner contributions/i)).toBeInTheDocument()
      expect(screen.getByText(/total owner drawings/i)).toBeInTheDocument()
      expect(screen.getByText('Initial Capital Injection')).toBeInTheDocument()
      expect(screen.getByText('Owner Drawings')).toBeInTheDocument()
    })
  })
})
