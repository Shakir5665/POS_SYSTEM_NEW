import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WarehousesPage from '../pages/WarehousesPage'
import MigrationPage from '../pages/MigrationPage'
import SalesPage from '../pages/SalesPage'
import PurchasesPage from '../pages/PurchasesPage'
import ReportsPage from '../pages/ReportsPage'
import InventoryPage from '../pages/InventoryPage'
import { warehouseService } from '../services/warehouses'
import { migrationService } from '../services/migration'
import { returnsService } from '../services/returns'
import { stockAdjustmentService } from '../services/stockAdjustment'
import { salesService } from '../services/sales'
import { purchasesService } from '../services/purchases'
import { reportsService } from '../services/reports'
import { inventoryService } from '../services/inventory'

// Mock services
vi.mock('../services/warehouses', () => ({
  warehouseService: {
    list: vi.fn(),
    get: vi.fn(),
    getDefault: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('../services/migration', () => ({
  migrationService: {
    getStatus: vi.fn(),
    listBatches: vi.fn(),
    getBatch: vi.fn(),
    listIssues: vi.fn(),
  },
}))

vi.mock('../services/returns', () => ({
  returnsService: {
    getSaleEligibility: vi.fn(),
    createSalesReturn: vi.fn(),
    listSalesReturns: vi.fn(),
    getSalesReturn: vi.fn(),
    getPurchaseEligibility: vi.fn(),
    createPurchaseReturn: vi.fn(),
    listPurchaseReturns: vi.fn(),
    getPurchaseReturn: vi.fn(),
  },
}))

vi.mock('../services/stockAdjustment', () => ({
  stockAdjustmentService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../services/sales', () => ({
  salesService: {
    list: vi.fn(),
    get: vi.fn(),
    refund: vi.fn(),
  },
}))

vi.mock('../services/purchases', () => ({
  purchasesService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    receive: vi.fn(),
  },
}))

vi.mock('../services/reports', () => ({
  reportsService: {
    salesSummary: vi.fn(),
    purchasesSummary: vi.fn(),
    salesReturns: vi.fn(),
    purchaseReturns: vi.fn(),
    salesByDay: vi.fn(),
    topProducts: vi.fn(),
    categoryPerformance: vi.fn(),
    cashierPerformance: vi.fn(),
    profit: vi.fn(),
    financialStatement: vi.fn(),
  },
}))

vi.mock('../services/inventory', () => ({
  inventoryService: {
    list: vi.fn(),
    lowStock: vi.fn().mockResolvedValue({ data: { data: [] } }),
    adjust: vi.fn(),
    restock: vi.fn(),
    log: vi.fn(),
  },
}))

vi.mock('../services/products', () => ({
  productsService: {
    list: vi.fn(),
  },
}))

vi.mock('../services/suppliers', () => ({
  suppliersService: {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}))

// Mock Auth
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', full_name: 'Test Admin', role: 'ADMIN' },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

// Mock Settings
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    currency_symbol: 'LKR',
  }),
}))

describe('Phase 5 Frontend Comprehensive Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    warehouseService.list.mockResolvedValue({
      data: {
        data: [
          {
            id: 'wh-1',
            code: 'WH-001',
            name: 'Main Warehouse',
            is_default: true,
            is_active: true,
            address: '100 Main St',
          },
        ],
      },
    })
  })

  describe('1. Warehouses Management (WarehousesPage)', () => {
    it('renders warehouse listing and enforces global balance rule notice', async () => {
      render(
        <MemoryRouter>
          <WarehousesPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Warehouse Management')).toBeInTheDocument()
      expect(screen.getByText(/Authoritative Inventory Balance Architecture/i)).toBeInTheDocument()
      expect(screen.getByText(/Product.quantity/i)).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('Main Warehouse')).toBeInTheDocument()
        expect(screen.getByText('WH-001')).toBeInTheDocument()
      })
    })
  })

  describe('2. Migration Engine & Dashboard (MigrationPage)', () => {
    it('renders audit batches, unresolved mappings alert, and locked Excel dropzone', async () => {
      migrationService.listBatches.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'batch-1',
              batch_number: 'BATCH-20261122-001',
              entity_type: 'PRODUCT',
              source_file: 'legacy_data_template.xlsx',
              file_checksum: 'b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4',
              total_records: 120,
              successful_records: 120,
              failed_records: 0,
              status: 'COMPLETED',
              created_at: new Date().toISOString(),
            },
          ],
        },
      })

      migrationService.listIssues.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'iss-1',
              severity: 'ERROR',
              entity_type: 'EXPENSE',
              legacy_id: 'EXP-005',
              issue_code: 'UNRESOLVED_CATEGORY_MAPPING',
              description: 'Expense category "home" has no mapping',
            },
          ],
        },
      })

      migrationService.getStatus.mockResolvedValueOnce({
        data: {
          data: { total_batches: 1, total_records: 120 },
        },
      })

      render(
        <MemoryRouter>
          <MigrationPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Legacy Migration Engine')).toBeInTheDocument()
      expect(screen.getAllByText(/Migration Batches/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/Issues & Unresolved Mappings/i)).toBeInTheDocument()
      expect(screen.getByText(/Excel Import \(Phase 4B Readiness\)/i)).toBeInTheDocument()

      // Switch to Issues tab to verify known unresolved mappings alert
      fireEvent.click(screen.getByText(/Issues & Unresolved Mappings/i))
      expect(screen.getByText(/Known Unresolved Legacy Mappings/i)).toBeInTheDocument()
      expect(screen.getByText(/Expense Category ID 5/i)).toBeInTheDocument()
      expect(screen.getByText(/Orphan Sub-Records/i)).toBeInTheDocument()

      // Switch to Excel Import tab to verify locked state
      fireEvent.click(screen.getByText(/Excel Import \(Phase 4B Readiness\)/i))
      expect(screen.getByText(/Phase 4B Migration Execution Locked/i)).toBeInTheDocument()
      expect(screen.getByText(/b392557f09df3dd191aed9f178f89722d10a44b43294949c670e53f24bac03a4/i)).toBeInTheDocument()
    })
  })

  describe('3. Sales Management & Sales Returns (SalesPage)', () => {
    it('displays legacy badge, warehouse attribution, and opens return modal with eligibility', async () => {
      salesService.list.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'sale-1',
              transaction_id: 'TXN-1001',
              sale_date: '2026-11-20T10:00:00.000Z',
              created_at: '2026-11-20T10:00:00.000Z',
              total_amount: 150.0,
              payment_status: 'COMPLETED',
              payment_method: 'CASH',
              is_legacy_import: false,
              user: { full_name: 'Cashier Alice' },
              customer: { name: 'Bob' },
              warehouse: { name: 'Main Warehouse' },
            },
            {
              id: 'sale-legacy',
              transaction_id: 'TXN-LEGACY-01',
              sale_date: '2021-05-10T10:00:00.000Z',
              created_at: '2021-05-10T10:00:00.000Z',
              total_amount: 50.0,
              payment_status: 'COMPLETED',
              payment_method: 'CASH',
              is_legacy_import: true,
              user: { full_name: 'Migrated User' },
              customer: { name: 'Charlie' },
              warehouse: { name: 'Main Warehouse' },
            },
          ],
          meta: { page: 1, total_pages: 1 },
        },
      })

      returnsService.getSaleEligibility.mockResolvedValueOnce({
        data: {
          data: {
            sale: { id: 'sale-1', transaction_id: 'TXN-1001' },
            items: [
              {
                sale_item_id: 'si-1',
                product_id: 'prod-1',
                product_name: 'Fresh Milk',
                product_sku: 'MILK-01',
                quantity_sold: '3',
                returned_quantity: '0',
                remaining_quantity: '3',
                unit_price: 50.0,
              },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <SalesPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('TXN-1001')).toBeInTheDocument()
        expect(screen.getByText('TXN-LEGACY-01')).toBeInTheDocument()
        expect(screen.getByText('Legacy Import')).toBeInTheDocument()
      })

      // Click Return on live sale
      const returnButtons = screen.getAllByRole('button', { name: /^Return$/i })
      expect(returnButtons.length).toBe(1) // Only on live sale, not legacy
      fireEvent.click(returnButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/Process Customer Return: TXN-1001/i)).toBeInTheDocument()
        expect(screen.getByText('Fresh Milk')).toBeInTheDocument()
        expect(screen.getByText('MILK-01')).toBeInTheDocument()
      })
    })

    it('renders Sales Returns History tab and lists past customer returns', async () => {
      salesService.list.mockResolvedValueOnce({ data: { data: [], meta: { page: 1, total_pages: 1 } } })
      returnsService.listSalesReturns.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'sr-1',
              return_number: 'SR-20261122-0001',
              return_date: '2026-11-22T10:30:00.000Z',
              sale: { transaction_id: 'TXN-1001' },
              customer: { name: 'Bob' },
              warehouse: { name: 'Main Warehouse' },
              total_refund_amount: 50.0,
              refund_status: 'COMPLETED',
              user: { full_name: 'Manager Dave' },
            },
          ],
          meta: { page: 1, total_pages: 1 },
        },
      })

      render(
        <MemoryRouter>
          <SalesPage />
        </MemoryRouter>
      )

      // Switch to Sales Returns History tab
      fireEvent.click(screen.getByText('Sales Returns History'))

      await waitFor(() => {
        expect(screen.getByText('SR-20261122-0001')).toBeInTheDocument()
        expect(screen.getByText('Manager Dave')).toBeInTheDocument()
      })
    })
  })

  describe('4. Purchases Management & Vendor Returns (PurchasesPage)', () => {
    it('displays purchase orders, legacy import badge, and opens vendor return modal', async () => {
      purchasesService.list.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'po-1',
              purchase_number: 'PO-20261120-001',
              purchase_date: '2026-11-20T09:00:00.000Z',
              created_at: '2026-11-20T09:00:00.000Z',
              total_amount: 500.0,
              amount_paid: 500.0,
              balance_due: 0,
              status: 'RECEIVED',
              payment_status: 'COMPLETED',
              is_legacy_import: false,
              supplier: { name: 'Nestle Supplier' },
              warehouse: { name: 'Main Warehouse' },
              items: [{ id: 'pi-1' }],
            },
            {
              id: 'po-legacy',
              purchase_number: 'PO-LEGACY-01',
              purchase_date: '2021-04-10T09:00:00.000Z',
              created_at: '2021-04-10T09:00:00.000Z',
              total_amount: 300.0,
              amount_paid: 300.0,
              balance_due: 0,
              status: 'RECEIVED',
              payment_status: 'COMPLETED',
              is_legacy_import: true,
              supplier: { name: 'Historical Supplier' },
              warehouse: { name: 'Main Warehouse' },
              items: [{ id: 'pi-leg' }],
            },
          ],
          meta: { page: 1, total_pages: 1, total: 2 },
        },
      })

      returnsService.getPurchaseEligibility.mockResolvedValueOnce({
        data: {
          data: {
            purchase: { id: 'po-1', purchase_number: 'PO-20261120-001' },
            items: [
              {
                purchase_item_id: 'pi-1',
                product_id: 'prod-1',
                product_name: 'Nestle Coffee',
                product_sku: 'NES-01',
                quantity_received: '10',
                returned_quantity: '0',
                remaining_quantity: '10',
                available_stock: 8,
                unit_cost: 50.0,
              },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <PurchasesPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('PO-20261120-001')).toBeInTheDocument()
        expect(screen.getByText('PO-LEGACY-01')).toBeInTheDocument()
        expect(screen.getByText('Legacy Import')).toBeInTheDocument()
      })

      // Click Return on live received purchase
      const returnButtons = screen.getAllByRole('button', { name: /^Return$/i })
      expect(returnButtons.length).toBe(1) // Only on live received PO, not legacy
      fireEvent.click(returnButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/Return Goods to Supplier: PO-20261120-001/i)).toBeInTheDocument()
        expect(screen.getByText('Nestle Coffee')).toBeInTheDocument()
        expect(screen.getByText('NES-01')).toBeInTheDocument()
      })
    })

    it('renders Purchase Returns History tab and lists past supplier returns', async () => {
      purchasesService.list.mockResolvedValueOnce({ data: { data: [], meta: { page: 1, total_pages: 1, total: 0 } } })
      returnsService.listPurchaseReturns.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'pr-1',
              return_number: 'PR-20261122-0001',
              return_date: '2026-11-22T11:00:00.000Z',
              purchase: { purchase_number: 'PO-20261120-001' },
              supplier: { name: 'Nestle Supplier' },
              warehouse: { name: 'Main Warehouse' },
              total_amount: 100.0,
              settlement_status: 'PENDING',
              user: { full_name: 'Manager Dave' },
            },
          ],
          meta: { page: 1, total_pages: 1, total: 1 },
        },
      })

      render(
        <MemoryRouter>
          <PurchasesPage />
        </MemoryRouter>
      )

      // Switch to Purchase Returns History tab
      fireEvent.click(screen.getByText('Purchase Returns History'))

      await waitFor(() => {
        expect(screen.getByText('PR-20261122-0001')).toBeInTheDocument()
        expect(screen.getByText('PENDING')).toBeInTheDocument()
      })
    })
  })

  describe('5. Reports & Analytics (ReportsPage)', () => {
    it('displays gross sales, sales returns, and net sales revenue on summary tab', async () => {
      reportsService.salesSummary.mockResolvedValueOnce({
        data: {
          gross_sales: 1000.0,
          sales_returns: 200.0,
          sales_return_count: 2,
          net_sales: 800.0,
          total_revenue: 1000.0,
          transaction_count: 10,
          average_sale: 100.0,
          total_discount: 10.0,
          total_tax: 0.0,
        },
      })

      render(
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Gross Sales')).toBeInTheDocument()
        expect(screen.getByText('Sales Returns (Refunds)')).toBeInTheDocument()
        expect(screen.getByText('Net Sales Revenue')).toBeInTheDocument()
      })
    })

    it('switches to Purchases Summary tab and displays net purchases KPIs', async () => {
      reportsService.salesSummary.mockResolvedValueOnce({ data: {} })
      reportsService.purchasesSummary.mockResolvedValueOnce({
        data: {
          gross_purchases: 5000.0,
          purchase_returns: 500.0,
          return_count: 1,
          net_purchases: 4500.0,
          order_count: 5,
          average_order: 1000.0,
        },
      })

      render(
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByText('Purchases Summary'))

      await waitFor(() => {
        expect(screen.getByText('Gross Purchases')).toBeInTheDocument()
        expect(screen.getByText('Purchase Returns (Defects)')).toBeInTheDocument()
        expect(screen.getByText('Net Purchases Cost')).toBeInTheDocument()
      })
    })
  })

  describe('6. Stock Adjustment View Switcher (InventoryPage)', () => {
    it('renders stock adjustments view switcher and displays adjustment history', async () => {
      inventoryService.list.mockResolvedValue({
        data: { data: [], meta: { page: 1, total_pages: 1, total: 0 } },
      })
      stockAdjustmentService.list.mockResolvedValue({
        data: {
          data: [
            {
              id: 'adj-1',
              adjustment_number: 'ADJ-20261122-001',
              adjustment_type: 'RECONCILIATION',
              adjustment_date: '2026-11-22T08:00:00.000Z',
              warehouse: { name: 'Main Warehouse' },
              user: { full_name: 'Inventory Manager' },
              items: [{ id: 'ai-1', quantity_change: 5, product: { name: 'Item 1' } }],
            },
          ],
          meta: { page: 1, total_pages: 1 },
        },
      })

      render(
        <MemoryRouter>
          <InventoryPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Stock Balances')).toBeInTheDocument()
      expect(screen.getByText('Stock Adjustments')).toBeInTheDocument()

      // Switch to Stock Adjustments tab
      fireEvent.click(screen.getByRole('button', { name: /Stock Adjustments/i }))

      await waitFor(() => {
        expect(screen.getByText('ADJ-20261122-001')).toBeInTheDocument()
        expect(screen.getByText(/New Adjustment/i)).toBeInTheDocument()
      })
    })
  })
})
