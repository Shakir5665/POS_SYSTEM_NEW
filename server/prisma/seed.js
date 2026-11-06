const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const { checkSeedAllowed, describeDatabase } = require('./seedGuard')

const prisma = new PrismaClient()

const BCRYPT_COST = 12

async function main() {
  const { allowed, reason } = checkSeedAllowed(process.env)
  if (!allowed) {
    console.error(reason)
    process.exitCode = 1
    return
  }

  console.log(`Seeding ${describeDatabase(process.env.DATABASE_URL)}`)
  console.log('This deletes ALL existing data (users, products, customers, sales, settings) and inserts sample data.')

  // Clean up existing data (in reverse FK order)
  await prisma.authLog.deleteMany()
  await prisma.inventoryLog.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.settings.deleteMany()

  // Settings
  await prisma.settings.createMany({
    data: [
      { key: 'store_name', value: 'GhanaShop POS' },
      { key: 'store_address', value: '14 Liberation Road, Accra, Ghana' },
      { key: 'store_phone', value: '030-200-0000' },
      { key: 'tax_rate', value: '0' },
      { key: 'loyalty_points_rate', value: '10' },
      { key: 'currency_symbol', value: 'GH₵' },
      { key: 'receipt_footer', value: 'Thank you for shopping with us!' },
    ],
  })
  console.log('Settings created')

  // Users
  const adminHash = await bcrypt.hash('admin123', BCRYPT_COST)
  const managerHash = await bcrypt.hash('manager123', BCRYPT_COST)
  const cashierHash = await bcrypt.hash('cashier123', BCRYPT_COST)

  const [admin, manager, cashier] = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@ghanapos.com',
        password_hash: adminHash,
        full_name: 'Admin User',
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        username: 'manager',
        email: 'manager@ghanapos.com',
        password_hash: managerHash,
        full_name: 'Kwame Asante',
        role: 'MANAGER',
      },
    }),
    prisma.user.create({
      data: {
        username: 'cashier',
        email: 'cashier@ghanapos.com',
        password_hash: cashierHash,
        full_name: 'Ama Mensah',
        role: 'CASHIER',
      },
    }),
  ])
  console.log('Users created')

  // Categories
  const categoryData = [
    { name: 'Beverages', description: 'Drinks, water, and juices' },
    { name: 'Snacks', description: 'Biscuits, chips, and confectionery' },
    { name: 'Dairy', description: 'Milk, cheese, and dairy products' },
    { name: 'Household', description: 'Cleaning and household products' },
    { name: 'Personal Care', description: 'Soaps, lotions, and hygiene products' },
    { name: 'Stationery', description: 'Pens, paper, and office supplies' },
  ]

  const categories = {}
  for (const cat of categoryData) {
    const created = await prisma.category.create({ data: cat })
    categories[cat.name] = created
  }
  console.log('Categories created')

  // Products
  const productData = [
    // Beverages (10)
    { name: 'Coca-Cola 500ml', sku: 'BEV-001', barcode: '5449000000996', category: 'Beverages', price: 5.00, cost_price: 3.50, quantity: 120, low_stock_threshold: 20 },
    { name: 'Malt Drink 330ml', sku: 'BEV-002', barcode: '6001240005982', category: 'Beverages', price: 4.50, cost_price: 3.00, quantity: 96, low_stock_threshold: 20 },
    { name: 'Voltic Water 1.5L', sku: 'BEV-003', barcode: '6009521300018', category: 'Beverages', price: 6.00, cost_price: 4.00, quantity: 150, low_stock_threshold: 30 },
    { name: 'Alvaro Pineapple 330ml', sku: 'BEV-004', barcode: '6001240009102', category: 'Beverages', price: 4.00, cost_price: 2.80, quantity: 72, low_stock_threshold: 15 },
    { name: 'Malta Guinness 330ml', sku: 'BEV-005', barcode: '6001240018104', category: 'Beverages', price: 5.50, cost_price: 3.80, quantity: 84, low_stock_threshold: 15 },
    { name: 'Club Beer 330ml', sku: 'BEV-006', barcode: '6009703030019', category: 'Beverages', price: 7.00, cost_price: 5.00, quantity: 60, low_stock_threshold: 12 },
    { name: 'Sprite 500ml', sku: 'BEV-007', barcode: '5449000133328', category: 'Beverages', price: 5.00, cost_price: 3.50, quantity: 108, low_stock_threshold: 20 },
    { name: 'Nestlé Pure Life 600ml', sku: 'BEV-008', barcode: '6294003614143', category: 'Beverages', price: 3.50, cost_price: 2.00, quantity: 200, low_stock_threshold: 40 },
    { name: 'Soya Milk 250ml', sku: 'BEV-009', barcode: '6001159072891', category: 'Beverages', price: 3.00, cost_price: 2.00, quantity: 48, low_stock_threshold: 10 },
    { name: 'Lacasera Apple 500ml', sku: 'BEV-010', barcode: '6001240018890', category: 'Beverages', price: 4.50, cost_price: 3.00, quantity: 0, low_stock_threshold: 15 },

    // Snacks (10)
    { name: 'Pringles Original 165g', sku: 'SNK-001', barcode: '5053990101527', category: 'Snacks', price: 28.00, cost_price: 20.00, quantity: 40, low_stock_threshold: 8 },
    { name: 'Digestive Biscuits 400g', sku: 'SNK-002', barcode: '5000120011536', category: 'Snacks', price: 15.00, cost_price: 10.50, quantity: 55, low_stock_threshold: 10 },
    { name: 'TomTom Candy 100g', sku: 'SNK-003', barcode: '8710398510075', category: 'Snacks', price: 4.00, cost_price: 2.50, quantity: 80, low_stock_threshold: 15 },
    { name: 'Fan Ice Cream 100ml', sku: 'SNK-004', barcode: '6001240003582', category: 'Snacks', price: 3.50, cost_price: 2.20, quantity: 30, low_stock_threshold: 10 },
    { name: 'Indomie Noodles 70g', sku: 'SNK-005', barcode: '8850987141009', category: 'Snacks', price: 3.00, cost_price: 1.80, quantity: 150, low_stock_threshold: 30 },
    { name: 'Kwashie Groundnuts 200g', sku: 'SNK-006', barcode: '6009507040062', category: 'Snacks', price: 8.00, cost_price: 5.50, quantity: 45, low_stock_threshold: 10 },
    { name: 'Richoco Biscuits 200g', sku: 'SNK-007', barcode: '6001240042949', category: 'Snacks', price: 6.50, cost_price: 4.20, quantity: 60, low_stock_threshold: 12 },
    { name: 'Toffee Candy Mix 150g', sku: 'SNK-008', barcode: '8710398520074', category: 'Snacks', price: 5.00, cost_price: 3.00, quantity: 70, low_stock_threshold: 15 },
    { name: 'Uncle Sam Chips 50g', sku: 'SNK-009', barcode: '6009507045067', category: 'Snacks', price: 3.00, cost_price: 1.80, quantity: 90, low_stock_threshold: 20 },
    { name: 'Supermalt 330ml', sku: 'SNK-010', barcode: '5010394225512', category: 'Snacks', price: 6.00, cost_price: 4.00, quantity: 5, low_stock_threshold: 10 },

    // Dairy (8)
    { name: 'Peak Milk Powder 400g', sku: 'DAI-001', barcode: '6001240001267', category: 'Dairy', price: 32.00, cost_price: 24.00, quantity: 35, low_stock_threshold: 8 },
    { name: 'Cowbell Milk Tin 400g', sku: 'DAI-002', barcode: '6001240010109', category: 'Dairy', price: 28.00, cost_price: 20.00, quantity: 40, low_stock_threshold: 8 },
    { name: 'Vitamilk 250ml', sku: 'DAI-003', barcode: '8850718100085', category: 'Dairy', price: 5.00, cost_price: 3.50, quantity: 60, low_stock_threshold: 12 },
    { name: 'Hollandia Yoghurt 500ml', sku: 'DAI-004', barcode: '6001240018897', category: 'Dairy', price: 12.00, cost_price: 8.50, quantity: 25, low_stock_threshold: 6 },
    { name: 'Cowbella Milk 500ml', sku: 'DAI-005', barcode: '6001240009119', category: 'Dairy', price: 8.50, cost_price: 6.00, quantity: 48, low_stock_threshold: 10 },
    { name: 'Friesland Cheese 200g', sku: 'DAI-006', barcode: '8710398520097', category: 'Dairy', price: 25.00, cost_price: 18.00, quantity: 20, low_stock_threshold: 5 },
    { name: 'Fan Milk Ice Pop', sku: 'DAI-007', barcode: '6001240003599', category: 'Dairy', price: 2.50, cost_price: 1.50, quantity: 0, low_stock_threshold: 10 },
    { name: 'Peak UHT Milk 1L', sku: 'DAI-008', barcode: '6001240001274', category: 'Dairy', price: 18.00, cost_price: 13.00, quantity: 30, low_stock_threshold: 8 },

    // Household (10)
    { name: 'Omo Detergent 500g', sku: 'HOU-001', barcode: '8717163571965', category: 'Household', price: 12.00, cost_price: 8.50, quantity: 80, low_stock_threshold: 15 },
    { name: 'Ariel Powder 1kg', sku: 'HOU-002', barcode: '8001841390413', category: 'Household', price: 22.00, cost_price: 16.00, quantity: 45, low_stock_threshold: 10 },
    { name: 'Sunlight Dish Liquid 500ml', sku: 'HOU-003', barcode: '6001087019665', category: 'Household', price: 8.00, cost_price: 5.50, quantity: 60, low_stock_threshold: 12 },
    { name: 'Dettol Antiseptic 500ml', sku: 'HOU-004', barcode: '6001087023891', category: 'Household', price: 18.00, cost_price: 13.00, quantity: 35, low_stock_threshold: 8 },
    { name: 'Morning Fresh 500ml', sku: 'HOU-005', barcode: '6001087024898', category: 'Household', price: 10.00, cost_price: 7.00, quantity: 50, low_stock_threshold: 10 },
    { name: 'Mr Muscle Bathroom 500ml', sku: 'HOU-006', barcode: '5000204165012', category: 'Household', price: 22.00, cost_price: 16.00, quantity: 28, low_stock_threshold: 6 },
    { name: 'Toilet Duck Cleaner 500ml', sku: 'HOU-007', barcode: '8714789007090', category: 'Household', price: 18.00, cost_price: 13.00, quantity: 22, low_stock_threshold: 5 },
    { name: 'Ace Bleach 750ml', sku: 'HOU-008', barcode: '8001841389127', category: 'Household', price: 9.00, cost_price: 6.00, quantity: 40, low_stock_threshold: 8 },
    { name: 'Airwick Air Freshener', sku: 'HOU-009', barcode: '5000204013597', category: 'Household', price: 32.00, cost_price: 23.00, quantity: 20, low_stock_threshold: 5 },
    { name: 'Cantu Shea Butter Lotion', sku: 'HOU-010', barcode: '8714789007083', category: 'Household', price: 45.00, cost_price: 33.00, quantity: 15, low_stock_threshold: 5 },

    // Personal Care (8)
    { name: 'Dove Soap Bar 90g', sku: 'PCA-001', barcode: '8712561542497', category: 'Personal Care', price: 7.00, cost_price: 4.80, quantity: 100, low_stock_threshold: 20 },
    { name: 'Vaseline Lotion 400ml', sku: 'PCA-002', barcode: '8712561230527', category: 'Personal Care', price: 20.00, cost_price: 14.00, quantity: 55, low_stock_threshold: 10 },
    { name: 'Always Sanitary Pads 8pk', sku: 'PCA-003', barcode: '8001841390420', category: 'Personal Care', price: 12.00, cost_price: 8.50, quantity: 65, low_stock_threshold: 12 },
    { name: 'Colgate Toothpaste 75ml', sku: 'PCA-004', barcode: '7891024128533', category: 'Personal Care', price: 9.00, cost_price: 6.20, quantity: 75, low_stock_threshold: 15 },
    { name: 'Gillette Mach3 Razor', sku: 'PCA-005', barcode: '7702018388721', category: 'Personal Care', price: 35.00, cost_price: 25.00, quantity: 25, low_stock_threshold: 5 },
    { name: 'Lux Soap Bar 85g', sku: 'PCA-006', barcode: '8712561542480', category: 'Personal Care', price: 5.50, cost_price: 3.80, quantity: 90, low_stock_threshold: 18 },
    { name: 'Head & Shoulders 400ml', sku: 'PCA-007', barcode: '8001841352016', category: 'Personal Care', price: 38.00, cost_price: 28.00, quantity: 30, low_stock_threshold: 6 },
    { name: 'ORS Olive Oil 250ml', sku: 'PCA-008', barcode: '0381519005120', category: 'Personal Care', price: 42.00, cost_price: 30.00, quantity: 18, low_stock_threshold: 4 },

    // Stationery (6)
    { name: 'Bic Ballpen Blue 10pk', sku: 'STA-001', barcode: '0070330102013', category: 'Stationery', price: 8.00, cost_price: 5.50, quantity: 85, low_stock_threshold: 15 },
    { name: 'A4 Paper Ream 500 sheets', sku: 'STA-002', barcode: '5901436786641', category: 'Stationery', price: 55.00, cost_price: 40.00, quantity: 30, low_stock_threshold: 5 },
    { name: 'Stapler Standard', sku: 'STA-003', barcode: '0049793000001', category: 'Stationery', price: 22.00, cost_price: 15.00, quantity: 15, low_stock_threshold: 3 },
    { name: 'Correction Fluid 20ml', sku: 'STA-004', barcode: '0070330201012', category: 'Stationery', price: 4.50, cost_price: 2.80, quantity: 40, low_stock_threshold: 8 },
    { name: 'Ruler 30cm Plastic', sku: 'STA-005', barcode: '0049793000018', category: 'Stationery', price: 2.50, cost_price: 1.50, quantity: 50, low_stock_threshold: 10 },
    { name: 'Scotch Tape 18mm x 33m', sku: 'STA-006', barcode: '0021200769015', category: 'Stationery', price: 6.00, cost_price: 3.80, quantity: 35, low_stock_threshold: 8 },
  ]

  const products = {}
  for (const p of productData) {
    const created = await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category_id: categories[p.category].id,
        price: p.price,
        cost_price: p.cost_price,
        quantity: p.quantity,
        low_stock_threshold: p.low_stock_threshold,
      },
    })
    products[p.sku] = { ...created, originalQuantity: p.quantity }
  }
  console.log(`${productData.length} products created`)

  // Customers
  const customerData = [
    { name: 'Kofi Acheampong', phone: '024-123-4567', email: 'kofi.acheampong@gmail.com', loyalty_points: 250 },
    { name: 'Abena Boateng', phone: '050-234-5678', email: 'abena.boateng@yahoo.com', loyalty_points: 180 },
    { name: 'Yaw Darko', phone: '026-345-6789', email: 'yaw.darko@hotmail.com', loyalty_points: 90 },
    { name: 'Akosua Frimpong', phone: '055-456-7890', email: 'akosua.frimpong@gmail.com', loyalty_points: 500 },
    { name: 'Kwesi Asare', phone: '024-567-8901', email: null, loyalty_points: 0 },
    { name: 'Adwoa Mensah', phone: '050-678-9012', email: 'adwoa.mensah@gmail.com', loyalty_points: 320 },
    { name: 'Nana Owusu', phone: '026-789-0123', email: null, loyalty_points: 45 },
    { name: 'Esi Amponsah', phone: '055-890-1234', email: 'esi.amponsah@yahoo.com', loyalty_points: 120 },
    { name: 'Fiifi Ansah', phone: '024-901-2345', email: null, loyalty_points: 75 },
    { name: 'Maame Serwaa', phone: '050-012-3456', email: 'maame.serwaa@gmail.com', loyalty_points: 210 },
  ]

  const customers = []
  for (const c of customerData) {
    const created = await prisma.customer.create({ data: c })
    customers.push(created)
  }
  console.log('Customers created')

  // Sample Sales (20 sales over the past 30 days)
  const allProductSkus = Object.keys(products)
  const users = [admin, manager, cashier]
  const paymentMethods = ['CASH', 'MOBILE_MONEY', 'CARD']

  const taxRate = 0.0

  for (let i = 0; i < 20; i++) {
    const daysAgo = Math.floor(Math.random() * 30)
    const saleDate = new Date()
    saleDate.setDate(saleDate.getDate() - daysAgo)
    saleDate.setHours(Math.floor(Math.random() * 12) + 8) // 8am-8pm

    const cashier = users[Math.floor(Math.random() * users.length)]
    const customer = Math.random() > 0.3 ? customers[Math.floor(Math.random() * customers.length)] : null
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)]

    // Pick 1-4 random products with sufficient stock
    const availableSkus = allProductSkus.filter((sku) => products[sku].quantity > 0)
    const numItems = Math.min(Math.floor(Math.random() * 4) + 1, availableSkus.length)
    const selectedSkus = availableSkus.sort(() => 0.5 - Math.random()).slice(0, numItems)

    const saleItems = selectedSkus.map((sku) => {
      const product = products[sku]
      const qty = Math.min(Math.floor(Math.random() * 3) + 1, product.quantity)
      const unitPrice = parseFloat(product.price)
      return {
        productId: product.id,
        sku,
        qty,
        unitPrice,
        total: parseFloat((qty * unitPrice).toFixed(2)),
      }
    })

    const subtotal = saleItems.reduce((sum, item) => sum + item.total, 0)
    const discountAmount = Math.random() > 0.8 ? parseFloat((subtotal * 0.05).toFixed(2)) : 0
    const taxAmount = parseFloat(((subtotal - discountAmount) * taxRate).toFixed(2))
    const totalAmount = parseFloat((subtotal - discountAmount + taxAmount).toFixed(2))
    const amountPaid = paymentMethod === 'CASH'
      ? parseFloat((totalAmount + Math.floor(Math.random() * 20)).toFixed(2))
      : totalAmount
    const changeGiven = parseFloat((amountPaid - totalAmount).toFixed(2))

    const transactionId = `TXN-${saleDate.getFullYear()}${String(saleDate.getMonth() + 1).padStart(2, '0')}${String(saleDate.getDate()).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          transaction_id: transactionId,
          user_id: cashier.id,
          customer_id: customer?.id || null,
          subtotal: subtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          payment_status: 'COMPLETED',
          created_at: saleDate,
        },
      })

      for (const item of saleItems) {
        await tx.saleItem.create({
          data: {
            sale_id: sale.id,
            product_id: item.productId,
            quantity: item.qty,
            unit_price: item.unitPrice,
            discount: 0,
            total: item.total,
          },
        })

        const prevQty = products[item.sku].quantity
        const newQty = prevQty - item.qty

        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: newQty },
        })

        await tx.inventoryLog.create({
          data: {
            product_id: item.productId,
            change_type: 'SALE',
            quantity_change: -item.qty,
            previous_quantity: prevQty,
            new_quantity: newQty,
            user_id: cashier.id,
            notes: `Sale: ${transactionId}`,
          },
        })

        // Update our in-memory quantity tracker
        products[item.sku] = { ...products[item.sku], quantity: newQty }
      }

      await tx.payment.create({
        data: {
          sale_id: sale.id,
          method: paymentMethod,
          amount_paid: amountPaid,
          change_given: changeGiven,
          reference: paymentMethod !== 'CASH' ? `REF${Date.now()}${i}` : null,
        },
      })

      // Award loyalty points if customer
      if (customer) {
        const pointsEarned = Math.floor(totalAmount / 10)
        if (pointsEarned > 0) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { loyalty_points: { increment: pointsEarned } },
          })
        }
      }
    })
  }

  console.log('20 sample sales created')
  console.log('Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
