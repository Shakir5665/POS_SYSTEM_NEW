import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import ReportsPage from '../pages/ReportsPage'
import { reportsService } from '../services/reports'

vi.mock('../services/reports', () => ({
  reportsService: {
    dashboard: vi.fn(),
    salesSummary: vi.fn(),
    salesByDay: vi.fn(),
    topProducts: vi.fn(),
    categoryPerformance: vi.fn(),
    cashierPerformance: vi.fn(),
    inventoryStatus: vi.fn(),
    profit: vi.fn(),
    financialStatement: vi.fn(),
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
    currency_symbol: 'LKR',
  }),
}))

const mockDashboardData = {
  today_revenue: 2500.0,
  today_collections: 1800.0,
  today_credit_sales: 700.0,
  today_transactions: 14,
  total_customer_receivables: 3200.0,
  total_supplier_payables: 1500.0,
  low_stock_alerts: 4,
  top_products: [{ name: 'Rice 5kg', revenue: 600.0, quantity: 12 }],
}

const mockFinancialStatement = {
  gross_sales: 15000.0,
  cash_collected: 11000.0,
  credit_sales: 4000.0,
  cogs: 9000.0,
  gross_profit: 6000.0,
  gross_profit_margin: 40.0,
  operating_expenses: 2500.0,
  net_profit: 3500.0,
  net_profit_margin: 23.33,
  total_customer_receivables: 3200.0,
  total_supplier_payables: 1500.0,
  expenses_by_category: [
    { category: 'Rent', amount: 1200.0 },
    { category: 'Utilities', amount: 800.0 },
    { category: 'Transport', amount: 500.0 },
  ],
}

describe('Batch 9: Dashboard and Financial Reports UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    reportsService.dashboard.mockResolvedValue({
      data: { data: mockDashboardData },
    })

    reportsService.salesSummary.mockResolvedValue({
      data: {
        data: {
          total_revenue: 2500.0,
          total_collected: 1800.0,
          total_credit: 700.0,
          transaction_count: 14,
        },
      },
    })

    reportsService.salesByDay.mockResolvedValue({
      data: { data: [{ label: '2026-11-08', value: 2500.0, transactions: 14 }] },
    })

    reportsService.topProducts.mockResolvedValue({
      data: { data: [] },
    })

    reportsService.categoryPerformance.mockResolvedValue({
      data: { data: [] },
    })

    reportsService.inventoryStatus.mockResolvedValue({
      data: {
        data: {
          total_products: 45,
          low_stock_count: 4,
          low_stock: [],
        },
      },
    })

    reportsService.financialStatement.mockResolvedValue({
      data: { data: mockFinancialStatement },
    })
  })

  it('renders DashboardPage with sales, cash collections, and credit receivables metrics', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: /dashboard/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/today's revenue/i)).toBeInTheDocument()
      expect(screen.getByText(/cash collected today/i)).toBeInTheDocument()
      expect(screen.getByText(/today's credit sales/i)).toBeInTheDocument()
      expect(screen.getByText(/customer receivables/i)).toBeInTheDocument()
      expect(screen.getByText(/supplier payables/i)).toBeInTheDocument()
    })
  })

  it('formats dashboard monetary KPI cards with compact number formatting and preserves full value in tooltips', async () => {
    reportsService.dashboard.mockResolvedValue({
      data: {
        data: {
          today_revenue: 1250000.0,
          today_collections: 110000.0,
          today_credit_sales: 950.0,
          today_transactions: 42,
          total_customer_receivables: 1000000000.0,
          total_supplier_payables: 50000.0,
          low_stock_alerts: 3,
        },
      },
    })

    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      // 1,250,000 -> 1.25M
      expect(screen.getByText('LKR 1.25M')).toBeInTheDocument()
      // 110,000 -> 110K
      expect(screen.getByText('LKR 110K')).toBeInTheDocument()
      // 950 below 1,000 -> 950.00
      expect(screen.getByText('LKR 950.00')).toBeInTheDocument()
      // 1,000,000,000 -> 1B
      expect(screen.getByText('LKR 1B')).toBeInTheDocument()
      // 50,000 -> 50K
      expect(screen.getByText('LKR 50K')).toBeInTheDocument()
      // Non-monetary counts
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    // Verify tooltips contain the full underlying monetary values
    const revenueElement = screen.getByText('LKR 1.25M')
    expect(revenueElement.getAttribute('title')).toBe('LKR 1,250,000.00')

    const receivablesElement = screen.getByText('LKR 1B')
    expect(receivablesElement.getAttribute('title')).toBe('LKR 1,000,000,000.00')

    const payablesElement = screen.getByText('LKR 50K')
    expect(payablesElement.getAttribute('title')).toBe('LKR 50,000.00')

    const creditElement = screen.getByText('LKR 950.00')
    expect(creditElement.getAttribute('title')).toBe('LKR 950.00')
  })

  it('renders ReportsPage and switches to Financial Statement (P&L) tab', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: /^reports$/i })).toBeInTheDocument()

    const statementTab = screen.getByRole('button', { name: /financial statement \(p&l\)/i })
    expect(statementTab).toBeInTheDocument()

    fireEvent.click(statementTab)

    await waitFor(() => {
      expect(screen.getByText(/gross sales revenue/i)).toBeInTheDocument()
      expect(screen.getByText(/cost of goods sold \(cogs\)/i)).toBeInTheDocument()
      expect(screen.getByText(/gross profit \(margin\)/i)).toBeInTheDocument()
      expect(screen.getByText(/net profit \(operating\)/i)).toBeInTheDocument()
      expect(screen.getByText(/immediate cash \/ digital payments/i)).toBeInTheDocument()
      expect(screen.getByText(/uncollected credit extended/i)).toBeInTheDocument()
    })
  })
})
