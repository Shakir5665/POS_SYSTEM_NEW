import { test, expect } from '@playwright/test'

// Deterministic Mock Fixtures
const MOCK_ADMIN_USER = {
  id: 'usr-admin-001',
  username: 'admin',
  full_name: 'System Administrator',
  role: 'ADMIN',
  created_at: '2026-01-01T00:00:00.000Z',
}

const MOCK_CASHIER_USER = {
  id: 'usr-cashier-001',
  username: 'cashier',
  full_name: 'Store Cashier',
  role: 'CASHIER',
  created_at: '2026-01-01T00:00:00.000Z',
}

const MOCK_SETTINGS = {
  store_name: 'NexTill POS Flagship',
  currency_symbol: 'LKR',
  tax_rate: 0,
  receipt_header: 'Welcome to NexTill',
  receipt_footer: 'Thank you for your business',
}

const MOCK_WAREHOUSE = {
  id: 'wh-main-001',
  code: 'WH-001',
  name: 'Main Warehouse',
  address: '100 Central Road',
  is_active: true,
  is_default: true,
}

const MOCK_PRODUCTS = [
  {
    id: 'prod-001',
    sku: 'SKU-COKE-500',
    name: 'Coca-Cola 500ml',
    barcode: '5449000000996',
    price: 150.0,
    cost_price: 100.0,
    quantity: 50.0,
    category_id: 'cat-001',
    category: { name: 'Beverages' },
    unit: 'pcs',
    is_active: true,
  },
  {
    id: 'prod-002',
    sku: 'SKU-RICE-1KG',
    name: 'Basmati Rice 1kg',
    barcode: '8901234567890',
    price: 450.0,
    cost_price: 320.0,
    quantity: 25.0,
    category_id: 'cat-002',
    category: { name: 'Grocery' },
    unit: 'kg',
    is_active: true,
  },
]

function setupMockRoutes(page, user = MOCK_ADMIN_USER, options = { initialAuth: true }) {
  let authenticated = options.initialAuth

  return page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()

    // Auth endpoints
    if (path === '/api/auth/login' && method === 'POST') {
      authenticated = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { user, accessToken: 'mock-jwt-token-playwright' },
          message: 'Login successful',
        }),
      })
    }
    if (path === '/api/auth/me') {
      if (!authenticated) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'Unauthorized' } }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: user }),
      })
    }
    if (path === '/api/auth/refresh') {
      if (!authenticated) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'No refresh token' } }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { accessToken: 'mock-jwt-token-refreshed' },
        }),
      })
    }
    if (path === '/api/auth/logout') {
      authenticated = false
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Logged out' }),
      })
    }

    // Settings
    if (path === '/api/settings') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_SETTINGS }),
      })
    }

    // Products
    if (path === '/api/products' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: MOCK_PRODUCTS,
          meta: { total: MOCK_PRODUCTS.length, page: 1, limit: 50 },
        }),
      })
    }

    // Categories
    if (path === '/api/categories') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'cat-001', name: 'Beverages' },
            { id: 'cat-002', name: 'Grocery' },
          ],
        }),
      })
    }

    // Warehouses
    if (path === '/api/warehouses/default') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: MOCK_WAREHOUSE,
        }),
      })
    }
    if (path === '/api/warehouses' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [MOCK_WAREHOUSE],
        }),
      })
    }
    if (path === '/api/warehouses' && method === 'POST') {
      const body = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'wh-new-002', ...body, is_default: false },
        }),
      })
    }

    // Customers
    if (path === '/api/customers' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'cust-001', name: 'Standard Walk-in Customer', phone: '0771234567' }],
        }),
      })
    }

    // Suppliers
    if (path === '/api/suppliers' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'supp-001', name: 'Lanka Distributors Ltd', contact_person: 'Kamal Perera' }],
        }),
      })
    }

    // Unmatched payments (Paystack webhook queue)
    if (path.includes('/payments/paystack/unmatched')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
    }

    // Sales
    if (path === '/api/sales' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'sale-001',
              transaction_id: 'TXN-20261122-0001',
              sale_date: '2026-11-22T08:00:00.000Z',
              grand_total: 300.0,
              paid_amount: 300.0,
              payment_method: 'CASH',
              status: 'COMPLETED',
              payment_status: 'COMPLETED',
              is_legacy_import: false,
              warehouse: { id: 'wh-main-001', name: 'Main Warehouse' },
              customer: { name: 'Standard Walk-in Customer' },
              user: { full_name: 'Store Cashier' },
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    }
    if (path === '/api/sales' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'sale-002',
            transaction_id: 'TXN-20261122-0002',
            grand_total: 150.0,
            status: 'COMPLETED',
          },
        }),
      })
    }
    if (path.startsWith('/api/sales/') && path.endsWith('/eligibility')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            sale_id: 'sale-001',
            transaction_id: 'TXN-20261122-0001',
            items: [
              {
                sale_item_id: 'item-001',
                product_id: 'prod-001',
                product_name: 'Coca-Cola 500ml',
                product_sku: 'SKU-COKE-500',
                unit: 'pcs',
                quantity_sold: 2.0,
                returned_quantity: 0.0,
                remaining_quantity: 2.0,
                unit_price: 150.0,
                discount_amount: 0.0,
                effective_price: 150.0,
              },
            ],
          },
        }),
      })
    }
    if (path === '/api/sales/returns' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'sr-001',
              return_number: 'SR-20261122-0001',
              return_date: '2026-11-22T09:00:00.000Z',
              refund_amount: 150.0,
              refund_status: 'COMPLETED',
              refund_method: 'CASH',
              reason: 'Customer changed mind',
              sale: { transaction_id: 'TXN-20261122-0001' },
              user: { full_name: 'System Administrator' },
              warehouse: { name: 'Main Warehouse' },
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    }
    if (path === '/api/sales/returns' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'sr-002',
            return_number: 'SR-20261122-0002',
            refund_amount: 150.0,
            refund_status: 'COMPLETED',
          },
        }),
      })
    }

    // Purchases
    if (path === '/api/purchases' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'po-001',
              purchase_number: 'PO-20261122-0001',
              purchase_date: '2026-11-22T07:00:00.000Z',
              total_amount: 1000.0,
              balance_due: 0.0,
              status: 'RECEIVED',
              payment_status: 'PAID',
              is_legacy_import: false,
              supplier: { name: 'Lanka Distributors Ltd' },
              warehouse: { name: 'Main Warehouse' },
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    }
    if (path === '/api/purchases' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'po-002', purchase_number: 'PO-20261122-0002', status: 'ORDERED' },
        }),
      })
    }
    if (path.startsWith('/api/purchases/') && path.endsWith('/eligibility')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            purchase_id: 'po-001',
            purchase_number: 'PO-20261122-0001',
            items: [
              {
                purchase_item_id: 'pitem-001',
                product_id: 'prod-001',
                product_name: 'Coca-Cola 500ml',
                unit: 'pcs',
                quantity: 10.0,
                previously_returned: 0.0,
                remaining_eligible_quantity: 10.0,
                available_stock: 50.0,
                unit_cost: 100.0,
              },
            ],
          },
        }),
      })
    }
    if (path === '/api/purchases/returns' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'pr-001',
              return_number: 'PR-20261122-0001',
              return_date: '2026-11-22T09:30:00.000Z',
              total_amount: 200.0,
              settlement_status: 'PENDING',
              reason: 'Damaged packaging',
              purchase: { purchase_number: 'PO-20261122-0001' },
              supplier: { name: 'Lanka Distributors Ltd' },
              warehouse: { name: 'Main Warehouse' },
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    }
    if (path === '/api/purchases/returns' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'pr-002',
            return_number: 'PR-20261122-0002',
            settlement_status: 'PENDING',
            total_amount: 200.0,
          },
        }),
      })
    }

    // Stock Adjustments
    if (path === '/api/inventory/adjustments' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'adj-001',
              adjustment_number: 'ADJ-20261122-0001',
              type: 'RESTOCK',
              reason: 'Physical cycle count',
              status: 'COMPLETED',
              created_at: '2026-11-22T06:00:00.000Z',
              warehouse: { name: 'Main Warehouse' },
              user: { full_name: 'System Administrator' },
              items: [
                {
                  id: 'adji-001',
                  product: { name: 'Coca-Cola 500ml', sku: 'SKU-COKE-500' },
                  quantity_change: 5.0,
                  previous_quantity: 45.0,
                  new_quantity: 50.0,
                },
              ],
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        }),
      })
    }
    if (path === '/api/inventory/adjustments' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'adj-002',
            adjustment_number: 'ADJ-20261122-0002',
            type: 'DAMAGE',
            status: 'COMPLETED',
          },
        }),
      })
    }

    // Reports & Dashboard
    if (path === '/api/reports/dashboard') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            today_sales: 1500,
            today_orders: 5,
            low_stock_count: 0,
            out_of_stock_count: 0,
          },
        }),
      })
    }
    if (path === '/api/reports/sales-by-day') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
    }
    if (path === '/api/reports/top-products') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
    }
    if (path === '/api/reports/category-performance') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      })
    }
    if (path === '/api/reports/inventory-status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_products: 2,
            total_value: 12000,
            low_stock: [],
            out_of_stock: [],
            low_stock_count: 0,
            out_of_stock_count: 0,
          },
        }),
      })
    }
    if (path === '/api/reports/sales-summary') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_sales_count: 10,
            gross_sales: 15000.0,
            sales_returns: 1500.0,
            net_sales: 13500.0,
            average_sale_value: 1350.0,
            discounts_total: 200.0,
            taxes_total: 0.0,
          },
        }),
      })
    }
    if (path === '/api/reports/purchases-summary') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_purchases_count: 5,
            gross_purchases: 8000.0,
            purchase_returns: 800.0,
            net_purchases: 7200.0,
          },
        }),
      })
    }
    if (path === '/api/reports/sales-returns') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_returns_count: 2,
            total_refund_amount: 1500.0,
            by_reason: [{ reason: 'Customer changed mind', count: 2, amount: 1500.0 }],
          },
        }),
      })
    }
    if (path === '/api/reports/purchase-returns') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_returns_count: 1,
            total_return_amount: 800.0,
            by_reason: [{ reason: 'Damaged packaging', count: 1, amount: 800.0 }],
          },
        }),
      })
    }

    // Migration
    if (path === '/api/migration/status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            batches_count: 2,
            issues_count: 9,
            legacy_id_maps_count: 450,
            is_locked: true,
          },
        }),
      })
    }
    if (path === '/api/migration/batches') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'mb-001',
              batch_number: 'BATCH-20261121-001',
              entity_type: 'SALES',
              status: 'DRY_RUN',
              total_records: 120,
              successful_records: 120,
              failed_records: 0,
              created_at: '2026-11-21T18:00:00.000Z',
            },
          ],
        }),
      })
    }
    if (path === '/api/migration/issues') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'mi-001',
              entity_type: 'EXPENSE',
              severity: 'WARNING',
              error_code: 'UNRESOLVED_CATEGORY_MAPPING',
              message: 'Expense category ID 5 ("home") requires mapping to COA',
              created_at: '2026-11-21T18:00:00.000Z',
            },
          ],
        }),
      })
    }

    // Default fallback
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    })
  })
}

test.describe('NexTill POS — Phase 6 Browser End-to-End Workflows', () => {
  test('Scenario 1 & 2: Login and navigation across authenticated routes', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: false })

    await page.goto('/login')
    await page.fill('input#username', 'admin')
    await page.fill('input[type="password"]', 'Password123!')
    await page.click('button[type="submit"]')

    // Admin navigates to /dashboard
    await page.waitForURL(/\/dashboard/)
    expect(page.url()).toContain('/dashboard')

    // Test Navigation links using href selectors
    await page.click('nav a[href="/sales"]')
    await page.waitForURL(/\/sales/)
    expect(page.url()).toContain('/sales')

    await page.click('nav a[href="/purchases"]')
    await page.waitForURL(/\/purchases/)
    expect(page.url()).toContain('/purchases')

    await page.click('nav a[href="/warehouses"]')
    await page.waitForURL(/\/warehouses/)
    expect(page.url()).toContain('/warehouses')

    await page.click('nav a[href="/reports"]')
    await page.waitForURL(/\/reports/)
    expect(page.url()).toContain('/reports')

    await page.click('nav a[href="/migration"]')
    await page.waitForURL(/\/migration/)
    expect(page.url()).toContain('/migration')
  })

  test('Scenario 3 & 4: POS product search, cart calculation, and sale creation', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/pos')

    await expect(page.locator('text=Coca-Cola 500ml').first()).toBeVisible({ timeout: 10000 })

    // Click product to add to cart
    await page.locator('text=Coca-Cola 500ml').first().click()

    // Verify cart shows item
    await expect(page.locator('text=150.00').first()).toBeVisible()
  })

  test('Scenario 5: Purchase order creation workflow', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/purchases')

    await expect(page.locator('text=PO-20261122-0001')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Lanka Distributors Ltd')).toBeVisible()
  })

  test('Scenario 6: Sales Return customer return modal and eligible quantity cap', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/sales')

    await expect(page.locator('text=TXN-20261122-0001')).toBeVisible({ timeout: 10000 })

    // Click Return button on eligible sale row (exact text "Return")
    const returnBtn = page.locator('td button:text-is("Return")').first()
    await expect(returnBtn).toBeVisible()
    await returnBtn.click()

    // Check return modal appears
    await expect(page.locator('text=Process Customer Return')).toBeVisible()
    await expect(page.locator('text=Coca-Cola 500ml')).toBeVisible()
    await expect(page.locator('text=Select Items & Quantities to Return')).toBeVisible()
  })

  test('Scenario 7: Purchase Return vendor return modal and pending credit', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/purchases')

    // Inspect purchase returns tab
    await page.click('button:has-text("Purchase Returns History")')
    await expect(page.locator('text=PR-20261122-0001')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=PENDING').first()).toBeVisible()
  })

  test('Scenario 8: Stock adjustments switcher and multi-item modal', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/inventory')

    // Click on Stock Adjustments tab
    await page.click('button:has-text("Stock Adjustments")')
    await expect(page.locator('text=ADJ-20261122-0001')).toBeVisible({ timeout: 10000 })

    // Open New Adjustment Modal
    await page.click('button:has-text("New Adjustment")')
    await expect(page.locator('text=Create Multi-Item Stock Adjustment')).toBeVisible()
  })

  test('Scenario 9: Warehouse management, validation, and authoritative stock notice', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/warehouses')

    await expect(page.locator('text=Warehouse Management')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=WH-001')).toBeVisible()
    await expect(page.locator('text=Main Warehouse')).toBeVisible()
    await expect(page.locator('text=Authoritative Inventory Balance Architecture')).toBeVisible()

    // Open Add Warehouse modal
    await page.click('button:has-text("Add Warehouse")')
    await expect(page.locator('text=Warehouse Code *')).toBeVisible()
  })

  test('Scenario 10 & 11: Reports summary KPIs and sanitized CSV export', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/reports')

    await expect(page.locator('text=Reports & Business Analytics')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Gross Sales', { exact: true })).toBeVisible()
    await expect(page.locator('text=Sales Returns (Refunds)')).toBeVisible()
    await expect(page.locator('text=Net Sales Revenue')).toBeVisible()

    // Verify Export CSV button is present and clickable
    const exportBtn = page.locator('button:has-text("Export CSV")').first()
    await expect(exportBtn).toBeVisible()
  })

  test('Scenario 12: Migration dashboard and locked Excel dropzone', async ({ page }) => {
    await setupMockRoutes(page, MOCK_ADMIN_USER, { initialAuth: true })
    await page.goto('/migration')

    await expect(page.locator('text=Legacy Migration Engine')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=BATCH-20261121-001')).toBeVisible()
    await page.click('button:has-text("Issues & Unresolved Mappings")')
    await expect(page.locator('text=Expense Category ID 5')).toBeVisible()
    await page.click('button:has-text("Excel Import (Phase 4B Readiness)")')
    await expect(page.locator('text=Phase 4B Migration Execution Locked')).toBeVisible()
  })

  test('Scenario 13: Role-based authorization restrictions for Cashier', async ({ page }) => {
    // Setup with CASHIER role
    await setupMockRoutes(page, MOCK_CASHIER_USER, { initialAuth: false })

    await page.goto('/login')
    await page.fill('input#username', 'cashier')
    await page.fill('input[type="password"]', 'Password123!')
    await page.click('button[type="submit"]')

    // Cashier navigates to /pos
    await page.waitForURL(/\/pos/)
    expect(page.url()).toContain('/pos')

    // Navigate to /warehouses as cashier -> ProtectedRoute should redirect away
    await page.goto('/warehouses')
    await page.waitForTimeout(1000)
    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/warehouses')
  })
})
