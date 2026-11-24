const { Prisma } = require('@prisma/client')
const prisma = require('../utils/prismaClient')
const { NotFoundError } = require('../utils/errors')

async function ensureWarehouseExists(warehouseId) {
  if (!warehouseId) return
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
  if (!wh) {
    throw new NotFoundError(`Warehouse with ID ${warehouseId} not found`)
  }
}

function dateRange(start_date, end_date) {
  const start = start_date ? new Date(start_date) : new Date(new Date().setDate(new Date().getDate() - 30))
  const end = end_date ? new Date(end_date) : new Date()
  end.setHours(23, 59, 59, 999)
  return { gte: start, lte: end }
}

async function getSalesSummary({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const where = {
    payment_status: { not: 'REFUNDED' },
    OR: [
      { sale_date: range },
      { sale_date: null, created_at: range },
    ],
  }
  if (warehouse_id) where.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const returnsWhere = {
    return_date: range,
    refund_status: 'COMPLETED',
  }
  if (warehouse_id) returnsWhere.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    returnsWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const [result, returnsAgg, itemDiscounts] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { total_amount: true, amount_paid: true, balance_due: true, discount_amount: true, tax_amount: true },
      _count: { id: true },
      _avg: { total_amount: true },
    }),
    prisma.salesReturn.aggregate({
      where: returnsWhere,
      _sum: { refund_amount: true },
      _count: { id: true },
    }),
    prisma.saleItem.aggregate({
      where: { sale: where },
      _sum: { discount: true, predefined_discount_amount: true },
    }),
  ])

  const grossSales = parseFloat(result._sum.total_amount || 0)
  const salesReturns = parseFloat(returnsAgg._sum.refund_amount || 0)
  const netSales = parseFloat((grossSales - salesReturns).toFixed(2))
  const cartDiscount = parseFloat(result._sum.discount_amount || 0)
  const lineDiscount = parseFloat(itemDiscounts._sum.discount || 0)
  const predefinedDiscount = parseFloat(itemDiscounts._sum.predefined_discount_amount || 0)
  const totalDiscount = parseFloat((cartDiscount + lineDiscount + predefinedDiscount).toFixed(2))

  return {
    gross_sales: grossSales,
    sales_returns: salesReturns,
    sales_return_count: returnsAgg._count.id,
    net_sales: netSales,
    total_revenue: grossSales,
    total_collected: parseFloat(result._sum.amount_paid || 0),
    total_credit: parseFloat(result._sum.balance_due || 0),
    transaction_count: result._count.id,
    average_sale: parseFloat(result._avg.total_amount || 0),
    total_discount: totalDiscount,
    cart_discount: cartDiscount,
    product_discount: parseFloat((lineDiscount + predefinedDiscount).toFixed(2)),
    total_tax: parseFloat(result._sum.tax_amount || 0),
  }
}

async function getPurchasesSummary({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const where = {
    status: { not: 'CANCELLED' },
    OR: [
      { purchase_date: range },
      { purchase_date: null, created_at: range },
    ],
  }
  if (warehouse_id) where.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const returnsWhere = {
    return_date: range,
  }
  if (warehouse_id) returnsWhere.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    returnsWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const [result, returnsAgg] = await Promise.all([
    prisma.purchase.aggregate({
      where,
      _sum: { total_amount: true, amount_paid: true, balance_due: true },
      _count: { id: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: returnsWhere,
      _sum: { total_amount: true },
      _count: { id: true },
    }),
  ])

  const grossPurchases = parseFloat(result._sum.total_amount || 0)
  const purchaseReturns = parseFloat(returnsAgg._sum.total_amount || 0)
  const netPurchases = parseFloat((grossPurchases - purchaseReturns).toFixed(2))
  const orderCount = result._count.id
  const returnCount = returnsAgg._count.id

  return {
    gross_purchases: grossPurchases,
    total_paid: parseFloat(result._sum.amount_paid || 0),
    total_due: parseFloat(result._sum.balance_due || 0),
    purchase_returns: purchaseReturns,
    purchase_return_count: returnCount,
    return_count: returnCount,
    net_purchases: netPurchases,
    purchase_count: orderCount,
    order_count: orderCount,
    average_order: orderCount > 0 ? parseFloat((grossPurchases / orderCount).toFixed(2)) : 0,
  }
}

async function getSalesReturnsReport({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const where = {
    return_date: range,
    refund_status: 'COMPLETED',
  }
  if (warehouse_id) where.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const returns = await prisma.salesReturn.findMany({
    where,
    include: {
      items: true,
      warehouse: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      sale: { select: { id: true, transaction_id: true } },
    },
    orderBy: { return_date: 'asc' },
  })

  let totalRefundAmount = 0
  let totalItemsReturned = 0
  const byReason = {}
  const byRefundMethod = {}
  const byDay = {}

  for (const r of returns) {
    const amt = parseFloat(r.refund_amount)
    totalRefundAmount += amt
    const reasonKey = r.reason || 'Unspecified'
    byReason[reasonKey] = (byReason[reasonKey] || 0) + amt

    const methodKey = r.refund_method || 'CASH'
    byRefundMethod[methodKey] = (byRefundMethod[methodKey] || 0) + amt

    const dateKey = r.return_date ? r.return_date.toISOString().split('T')[0] : (r.created_at ? r.created_at.toISOString().split('T')[0] : 'Unknown')
    byDay[dateKey] = (byDay[dateKey] || 0) + amt

    for (const item of (r.items || [])) {
      totalItemsReturned += parseFloat(item.quantity)
    }
  }

  const finalTotalRefund = parseFloat(totalRefundAmount.toFixed(2))

  return {
    total_refund_amount: finalTotalRefund,
    total_refunded: finalTotalRefund,
    total_returns_count: returns.length,
    count: returns.length,
    total_items_returned: parseFloat(totalItemsReturned.toFixed(3)),
    by_reason: Object.entries(byReason).map(([reason, amount]) => ({ reason, amount: parseFloat(amount.toFixed(2)) })),
    by_refund_method: Object.entries(byRefundMethod).map(([method, amount]) => ({ method, amount: parseFloat(amount.toFixed(2)) })),
    by_day: Object.entries(byDay).map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) })),
    returns: returns.map((r) => ({
      ...r,
      total_refund_amount: parseFloat(r.refund_amount || 0),
      refund_amount: parseFloat(r.refund_amount || 0),
    })),
  }
}

async function getPurchaseReturnsReport({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const where = {
    return_date: range,
  }
  if (warehouse_id) where.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    where.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const returns = await prisma.purchaseReturn.findMany({
    where,
    include: {
      items: true,
      warehouse: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, name: true } },
      purchase: { select: { id: true, purchase_number: true } },
      user: { select: { id: true, full_name: true } },
    },
    orderBy: { return_date: 'asc' },
  })

  let totalReturnAmount = 0
  let totalItemsReturned = 0
  const byReason = {}
  const bySettlementStatus = {}
  const byDay = {}

  for (const r of returns) {
    const amt = parseFloat(r.total_amount)
    totalReturnAmount += amt
    const reasonKey = r.reason || 'Unspecified'
    byReason[reasonKey] = (byReason[reasonKey] || 0) + amt

    const statusKey = r.settlement_status || 'PENDING'
    bySettlementStatus[statusKey] = (bySettlementStatus[statusKey] || 0) + amt

    const dateKey = r.return_date ? r.return_date.toISOString().split('T')[0] : (r.created_at ? r.created_at.toISOString().split('T')[0] : 'Unknown')
    byDay[dateKey] = (byDay[dateKey] || 0) + amt

    for (const item of (r.items || [])) {
      totalItemsReturned += parseFloat(item.quantity)
    }
  }

  const finalTotalReturn = parseFloat(totalReturnAmount.toFixed(2))

  return {
    total_return_amount: finalTotalReturn,
    total_returned: finalTotalReturn,
    total_returns_count: returns.length,
    count: returns.length,
    total_items_returned: parseFloat(totalItemsReturned.toFixed(3)),
    by_reason: Object.entries(byReason).map(([reason, amount]) => ({ reason, amount: parseFloat(amount.toFixed(2)) })),
    by_settlement_status: Object.entries(bySettlementStatus).map(([status, amount]) => ({ status, amount: parseFloat(amount.toFixed(2)) })),
    by_day: Object.entries(byDay).map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) })),
    returns: returns.map((r) => ({
      ...r,
      total_amount: parseFloat(r.total_amount || 0),
      return_value: parseFloat(r.total_amount || 0),
    })),
  }
}

async function getSalesByDay({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const sales = await prisma.$queryRaw`
    SELECT
      DATE(COALESCE(s.sale_date, s.created_at)) as label,
      COUNT(s.id)::int as transactions,
      SUM(s.total_amount)::float as value
    FROM "Sale" s
    WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
      AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
      ${warehouseFilter}
      ${legacyFilter}
    GROUP BY DATE(COALESCE(s.sale_date, s.created_at))
    ORDER BY DATE(COALESCE(s.sale_date, s.created_at)) ASC
  `
  return sales.map((r) => ({ label: r.label, value: parseFloat(r.value || 0), transactions: r.transactions }))
}

async function getTopProducts({ start_date, end_date, limit = 10, by = 'revenue', warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const lim = parseInt(limit) || 10
  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  let results
  if (by === 'quantity') {
    results = await prisma.$queryRaw`
      SELECT p.id, p.name, p.sku,
        ROUND(SUM(si.quantity)::numeric, 3)::float as total_quantity,
        SUM(si.total)::float as total_revenue
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
        AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
        AND s.payment_status = 'COMPLETED'
        ${warehouseFilter}
        ${legacyFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_quantity DESC
      LIMIT ${lim}
    `
  } else {
    results = await prisma.$queryRaw`
      SELECT p.id, p.name, p.sku,
        ROUND(SUM(si.quantity)::numeric, 3)::float as total_quantity,
        SUM(si.total)::float as total_revenue
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
        AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
        AND s.payment_status = 'COMPLETED'
        ${warehouseFilter}
        ${legacyFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_revenue DESC
      LIMIT ${lim}
    `
  }
  return results.map((r) => ({
    id: r.id,
    label: r.name,
    sku: r.sku,
    value: parseFloat(r.total_revenue || 0),
    quantity: r.total_quantity,
  }))
}

async function getCategoryPerformance({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const results = await prisma.$queryRaw`
    SELECT
      c.id,
      COALESCE(c.name, 'Uncategorized') as label,
      ROUND(SUM(si.quantity)::numeric, 3)::float as total_quantity,
      SUM(si.total)::float as value
    FROM "SaleItem" si
    JOIN "Product" p ON p.id = si.product_id
    LEFT JOIN "Category" c ON c.id = p.category_id
    JOIN "Sale" s ON s.id = si.sale_id
    WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
      AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
      ${warehouseFilter}
      ${legacyFilter}
    GROUP BY c.id, c.name
    ORDER BY value DESC
  `
  return results.map((r) => ({ id: r.id, label: r.label, value: parseFloat(r.value || 0), quantity: r.total_quantity }))
}

async function getCashierPerformance({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const results = await prisma.$queryRaw`
    SELECT
      u.id,
      u.full_name as label,
      u.username,
      COUNT(s.id)::int as transactions,
      SUM(s.total_amount)::float as value
    FROM "Sale" s
    JOIN "User" u ON u.id = s.user_id
    WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
      AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
      AND s.payment_status != 'REFUNDED'
      AND s.is_cancelled = false
      ${warehouseFilter}
      ${legacyFilter}
    GROUP BY u.id, u.full_name, u.username
    ORDER BY value DESC
  `
  return results.map((r) => ({
    id: r.id,
    name: r.label,
    label: r.label,
    username: r.username,
    total_revenue: parseFloat(r.value || 0),
    value: parseFloat(r.value || 0),
    transactions: r.transactions,
    transaction_count: r.transactions,
    count: r.transactions,
  }))
}

async function getInventoryStatus() {
  const [totalProducts, totalLowStock, totalOutOfStock, lowStockItems, outOfStockItems] = await Promise.all([
    prisma.product.count({ where: { is_active: true } }),
    prisma.$queryRaw`SELECT COUNT(*)::int as cnt FROM "Product" WHERE is_active = true AND quantity > 0 AND quantity <= low_stock_threshold`,
    prisma.$queryRaw`SELECT COUNT(*)::int as cnt FROM "Product" WHERE is_active = true AND quantity = 0`,
    prisma.$queryRaw`
      SELECT id, name, sku, quantity, low_stock_threshold
      FROM "Product"
      WHERE is_active = true AND quantity > 0 AND quantity <= low_stock_threshold
      ORDER BY quantity ASC
      LIMIT 20
    `,
    prisma.$queryRaw`
      SELECT id, name, sku, quantity
      FROM "Product"
      WHERE is_active = true AND quantity = 0
      ORDER BY name ASC
      LIMIT 20
    `,
  ])

  return {
    total_products: totalProducts,
    low_stock_count: totalLowStock[0].cnt,
    out_of_stock_count: totalOutOfStock[0].cnt,
    low_stock: lowStockItems,
    out_of_stock: outOfStockItems,
  }
}

async function getProfitReport({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)
  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const results = await prisma.$queryRaw`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.cost_price,
      SUM(si.total)::float as revenue,
      SUM(COALESCE(NULLIF(si.line_cost, 0), si.quantity * COALESCE(p.cost_price, 0)))::float as cost,
      SUM(si.total - COALESCE(NULLIF(si.line_cost, 0), si.quantity * COALESCE(p.cost_price, 0)))::float as profit,
      BOOL_OR(p.cost_price IS NULL AND (si.line_cost IS NULL OR si.line_cost = 0)) as unrecorded_cost
    FROM "SaleItem" si
    JOIN "Product" p ON p.id = si.product_id
    JOIN "Sale" s ON s.id = si.sale_id
    WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
      AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
      ${warehouseFilter}
      ${legacyFilter}
    GROUP BY p.id, p.name, p.sku, p.cost_price
    ORDER BY profit DESC
  `
  return results.map((r) => {
    const revenue = parseFloat(r.revenue || 0)
    const cost = parseFloat(r.cost || 0)
    const profit = parseFloat(r.profit || 0)
    const hasUnrecordedCost = Boolean(r.unrecorded_cost)
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      revenue,
      cost,
      profit,
      margin: hasUnrecordedCost ? null : (revenue > 0 ? (profit / revenue) * 100 : 0),
      unrecorded_cost: hasUnrecordedCost,
    }
  })
}

async function getFinancialStatement({ start_date, end_date, warehouse_id, is_legacy_import } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const range = dateRange(start_date, end_date)

  const salesWhere = {
    payment_status: { not: 'REFUNDED' },
    OR: [
      { sale_date: range },
      { sale_date: null, created_at: range },
    ],
  }
  if (warehouse_id) salesWhere.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    salesWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty
  const legacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND s.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const expenseWhere = { expense_date: range }
  if (is_legacy_import !== undefined) {
    expenseWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }
  const expenseLegacyFilter = is_legacy_import !== undefined
    ? Prisma.sql`AND e.is_legacy_import = ${is_legacy_import === 'true' || is_legacy_import === true}`
    : Prisma.empty

  const customerDebtWhere = { balance_due: { gt: 0 } }
  if (warehouse_id) customerDebtWhere.warehouse_id = warehouse_id

  const supplierDebtWhere = { status: { not: 'CANCELLED' }, balance_due: { gt: 0 } }
  if (warehouse_id) supplierDebtWhere.warehouse_id = warehouse_id

  const salesReturnsWhere = {
    return_date: range,
    refund_status: 'COMPLETED',
  }
  if (warehouse_id) salesReturnsWhere.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    salesReturnsWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const purchaseReturnsWhere = {
    return_date: range,
  }
  if (warehouse_id) purchaseReturnsWhere.warehouse_id = warehouse_id
  if (is_legacy_import !== undefined) {
    purchaseReturnsWhere.is_legacy_import = is_legacy_import === 'true' || is_legacy_import === true
  }

  const [salesAgg, itemsAgg, expensesAgg, customerDebtAgg, supplierDebtAgg, expensesByCategory, salesReturnsAgg, purchaseReturnsAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: salesWhere,
      _sum: { total_amount: true, amount_paid: true, balance_due: true },
      _count: { id: true },
    }),
    prisma.$queryRaw`
      SELECT
        COALESCE(SUM(COALESCE(NULLIF(si.line_cost, 0), si.quantity * COALESCE(p.cost_price, 0))), 0)::float as cogs
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE COALESCE(s.sale_date, s.created_at) >= ${range.gte}
        AND COALESCE(s.sale_date, s.created_at) <= ${range.lte}
        AND s.payment_status != 'REFUNDED'
        ${warehouseFilter}
        ${legacyFilter}
    `,
    prisma.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.sale.aggregate({
      where: customerDebtWhere,
      _sum: { balance_due: true },
    }),
    prisma.purchase.aggregate({
      where: supplierDebtWhere,
      _sum: { balance_due: true },
    }),
    prisma.$queryRaw`
      SELECT c.name as category, SUM(e.amount)::float as total
      FROM "Expense" e
      JOIN "ExpenseCategory" c ON c.id = e.category_id
      WHERE e.expense_date >= ${range.gte} AND e.expense_date <= ${range.lte}
        ${expenseLegacyFilter}
      GROUP BY c.name
      ORDER BY total DESC
    `,
    prisma.salesReturn.aggregate({
      where: salesReturnsWhere,
      _sum: { refund_amount: true },
      _count: { id: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: purchaseReturnsWhere,
      _sum: { total_amount: true },
      _count: { id: true },
    }),
  ])

  const gross_sales = parseFloat(salesAgg._sum.total_amount || 0)
  const sales_returns = parseFloat(salesReturnsAgg._sum.refund_amount || 0)
  const net_sales = parseFloat((gross_sales - sales_returns).toFixed(2))
  const purchase_returns = parseFloat(purchaseReturnsAgg._sum.total_amount || 0)
  const cash_collected = parseFloat(salesAgg._sum.amount_paid || 0)
  const credit_sales = parseFloat(salesAgg._sum.balance_due || 0)
  const cogs = parseFloat(itemsAgg[0]?.cogs || 0)
  const gross_profit = parseFloat((gross_sales - cogs).toFixed(2))
  const net_gross_profit = parseFloat((net_sales - cogs).toFixed(2))
  const operating_expenses = parseFloat(expensesAgg._sum.amount || 0)
  const net_profit = parseFloat((gross_profit - operating_expenses).toFixed(2))
  const net_profit_margin = gross_sales > 0 ? parseFloat(((net_profit / gross_sales) * 100).toFixed(2)) : 0
  const gross_profit_margin = gross_sales > 0 ? parseFloat(((gross_profit / gross_sales) * 100).toFixed(2)) : 0

  return {
    gross_sales,
    sales_returns,
    net_sales,
    purchase_returns,
    cash_collected,
    credit_sales,
    cogs,
    gross_profit,
    gross_profit_margin,
    net_gross_profit,
    operating_expenses,
    net_profit,
    net_profit_margin,
    total_customer_receivables: parseFloat(customerDebtAgg._sum.balance_due || 0),
    total_supplier_payables: parseFloat(supplierDebtAgg._sum.balance_due || 0),
    expenses_by_category: expensesByCategory.map((c) => ({
      category: c.category,
      amount: parseFloat(c.total || 0),
    })),
  }
}

async function getDashboardSummary({ warehouse_id } = {}) {
  await ensureWarehouseExists(warehouse_id)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const todaySalesWhere = {
    payment_status: { not: 'REFUNDED' },
    OR: [
      { sale_date: { gte: today, lte: todayEnd } },
      { sale_date: null, created_at: { gte: today, lte: todayEnd } },
    ],
  }
  if (warehouse_id) todaySalesWhere.warehouse_id = warehouse_id

  const customerDebtWhere = { balance_due: { gt: 0 } }
  if (warehouse_id) customerDebtWhere.warehouse_id = warehouse_id

  const supplierDebtWhere = { status: { not: 'CANCELLED' }, balance_due: { gt: 0 } }
  if (warehouse_id) supplierDebtWhere.warehouse_id = warehouse_id

  const warehouseFilter = warehouse_id ? Prisma.sql`AND s.warehouse_id = ${warehouse_id}` : Prisma.empty

  const [todaySales, customerDebtAgg, supplierDebtAgg, lowStockCount, topProducts] = await Promise.all([
    prisma.sale.aggregate({
      where: todaySalesWhere,
      _sum: { total_amount: true, amount_paid: true, balance_due: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: customerDebtWhere,
      _sum: { balance_due: true },
    }),
    prisma.purchase.aggregate({
      where: supplierDebtWhere,
      _sum: { balance_due: true },
    }),
    prisma.$queryRaw`SELECT COUNT(*)::int as cnt FROM "Product" WHERE is_active = true AND quantity > 0 AND quantity <= low_stock_threshold`,
    prisma.$queryRaw`
      SELECT p.name, SUM(si.total)::float as revenue, ROUND(SUM(si.quantity)::numeric, 3)::float as quantity
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE s.payment_status != 'REFUNDED'
        ${warehouseFilter}
      GROUP BY p.name
      ORDER BY revenue DESC
      LIMIT 5
    `,
  ])

  return {
    today_revenue: parseFloat(todaySales._sum.total_amount || 0),
    today_collections: parseFloat(todaySales._sum.amount_paid || 0),
    today_credit_sales: parseFloat(todaySales._sum.balance_due || 0),
    today_transactions: todaySales._count.id,
    total_customer_receivables: parseFloat(customerDebtAgg._sum.balance_due || 0),
    total_supplier_payables: parseFloat(supplierDebtAgg._sum.balance_due || 0),
    low_stock_alerts: lowStockCount[0].cnt,
    top_products: topProducts.map((r) => ({ name: r.name, revenue: parseFloat(r.revenue || 0), quantity: r.quantity })),
  }
}

module.exports = {
  getSalesSummary,
  getPurchasesSummary,
  getSalesReturnsReport,
  getPurchaseReturnsReport,
  getSalesByDay,
  getTopProducts,
  getCategoryPerformance,
  getCashierPerformance,
  getInventoryStatus,
  getProfitReport,
  getFinancialStatement,
  getDashboardSummary,
}
