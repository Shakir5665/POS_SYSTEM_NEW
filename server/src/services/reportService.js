const prisma = require('../utils/prismaClient')

function dateRange(start_date, end_date) {
  const start = start_date ? new Date(start_date) : new Date(new Date().setDate(new Date().getDate() - 30))
  const end = end_date ? new Date(end_date) : new Date()
  end.setHours(23, 59, 59, 999)
  return { gte: start, lte: end }
}

async function getSalesSummary({ start_date, end_date }) {
  const range = dateRange(start_date, end_date)
  const result = await prisma.sale.aggregate({
    where: { created_at: range, payment_status: 'COMPLETED' },
    _sum: { total_amount: true, discount_amount: true, tax_amount: true },
    _count: { id: true },
    _avg: { total_amount: true },
  })
  return {
    total_revenue: parseFloat(result._sum.total_amount || 0),
    transaction_count: result._count.id,
    average_sale: parseFloat(result._avg.total_amount || 0),
    total_discount: parseFloat(result._sum.discount_amount || 0),
    total_tax: parseFloat(result._sum.tax_amount || 0),
  }
}

async function getSalesByDay({ start_date, end_date }) {
  const range = dateRange(start_date, end_date)
  const sales = await prisma.$queryRaw`
    SELECT
      DATE(created_at) as label,
      COUNT(id)::int as transactions,
      SUM(total_amount)::float as value
    FROM "Sale"
    WHERE created_at >= ${range.gte} AND created_at <= ${range.lte}
      AND payment_status = 'COMPLETED'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC
  `
  return sales.map((r) => ({ label: r.label, value: parseFloat(r.value || 0), transactions: r.transactions }))
}

async function getTopProducts({ start_date, end_date, limit = 10, by = 'revenue' }) {
  const range = dateRange(start_date, end_date)
  const lim = parseInt(limit) || 10

  let results
  if (by === 'quantity') {
    results = await prisma.$queryRaw`
      SELECT p.id, p.name, p.sku,
        SUM(si.quantity)::int as total_quantity,
        SUM(si.total)::float as total_revenue
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE s.created_at >= ${range.gte} AND s.created_at <= ${range.lte}
        AND s.payment_status = 'COMPLETED'
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_quantity DESC
      LIMIT ${lim}
    `
  } else {
    results = await prisma.$queryRaw`
      SELECT p.id, p.name, p.sku,
        SUM(si.quantity)::int as total_quantity,
        SUM(si.total)::float as total_revenue
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE s.created_at >= ${range.gte} AND s.created_at <= ${range.lte}
        AND s.payment_status = 'COMPLETED'
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

async function getCategoryPerformance({ start_date, end_date }) {
  const range = dateRange(start_date, end_date)
  const results = await prisma.$queryRaw`
    SELECT
      c.id,
      c.name as label,
      SUM(si.quantity)::int as total_quantity,
      SUM(si.total)::float as value
    FROM "SaleItem" si
    JOIN "Product" p ON p.id = si.product_id
    JOIN "Category" c ON c.id = p.category_id
    JOIN "Sale" s ON s.id = si.sale_id
    WHERE s.created_at >= ${range.gte} AND s.created_at <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
    GROUP BY c.id, c.name
    ORDER BY value DESC
  `
  return results.map((r) => ({ id: r.id, label: r.label, value: parseFloat(r.value || 0), quantity: r.total_quantity }))
}

async function getCashierPerformance({ start_date, end_date }) {
  const range = dateRange(start_date, end_date)
  const results = await prisma.$queryRaw`
    SELECT
      u.id,
      u.full_name as label,
      u.username,
      COUNT(s.id)::int as transactions,
      SUM(s.total_amount)::float as value
    FROM "Sale" s
    JOIN "User" u ON u.id = s.user_id
    WHERE s.created_at >= ${range.gte} AND s.created_at <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
    GROUP BY u.id, u.full_name, u.username
    ORDER BY value DESC
  `
  return results.map((r) => ({
    id: r.id,
    label: r.label,
    username: r.username,
    value: parseFloat(r.value || 0),
    transactions: r.transactions,
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

async function getProfitReport({ start_date, end_date }) {
  const range = dateRange(start_date, end_date)
  const results = await prisma.$queryRaw`
    SELECT
      p.id,
      p.name,
      p.sku,
      SUM(si.total)::float as revenue,
      SUM(si.quantity * COALESCE(p.cost_price, 0))::float as cost,
      SUM(si.total - si.quantity * COALESCE(p.cost_price, 0))::float as profit
    FROM "SaleItem" si
    JOIN "Product" p ON p.id = si.product_id
    JOIN "Sale" s ON s.id = si.sale_id
    WHERE s.created_at >= ${range.gte} AND s.created_at <= ${range.lte}
      AND s.payment_status = 'COMPLETED'
    GROUP BY p.id, p.name, p.sku
    ORDER BY profit DESC
  `
  return results.map((r) => {
    const revenue = parseFloat(r.revenue || 0)
    const cost = parseFloat(r.cost || 0)
    const profit = parseFloat(r.profit || 0)
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  })
}

async function getDashboardSummary() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [todaySales, lowStockCount, topProducts] = await Promise.all([
    prisma.sale.aggregate({
      where: { created_at: { gte: today, lte: todayEnd }, payment_status: 'COMPLETED' },
      _sum: { total_amount: true },
      _count: { id: true },
    }),
    prisma.$queryRaw`SELECT COUNT(*)::int as cnt FROM "Product" WHERE is_active = true AND quantity > 0 AND quantity <= low_stock_threshold`,
    prisma.$queryRaw`
      SELECT p.name, SUM(si.total)::float as revenue, SUM(si.quantity)::int as quantity
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si.product_id
      JOIN "Sale" s ON s.id = si.sale_id
      WHERE s.payment_status = 'COMPLETED'
      GROUP BY p.name
      ORDER BY revenue DESC
      LIMIT 5
    `,
  ])

  return {
    today_revenue: parseFloat(todaySales._sum.total_amount || 0),
    today_transactions: todaySales._count.id,
    low_stock_alerts: lowStockCount[0].cnt,
    top_products: topProducts.map((r) => ({ name: r.name, revenue: parseFloat(r.revenue || 0), quantity: r.quantity })),
  }
}

module.exports = {
  getSalesSummary,
  getSalesByDay,
  getTopProducts,
  getCategoryPerformance,
  getCashierPerformance,
  getInventoryStatus,
  getProfitReport,
  getDashboardSummary,
}
