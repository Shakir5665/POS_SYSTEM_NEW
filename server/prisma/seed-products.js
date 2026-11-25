const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const products = [
  {
    name: 'Ceylon Black Tea 100g',
    sku: 'BEV-TEA-100G-001',
    category: 'Beverages',
    categoryDescription: 'Tea, coffee, bottled drinks, and other beverages',
    unit_category: 'COUNT',
    base_unit: 'pack',
    pricing_unit: 'pack',
    price: 1150,
    usual_price: 1250,
    our_price: 1150,
    wholesale_price: 1050,
    cost_price: 820,
    quantity: 24,
    low_stock_threshold: 5,
  },
  {
    name: 'Stainless Steel Water Bottle 750ml',
    sku: 'HOU-BOTTLE-750-001',
    category: 'Household',
    categoryDescription: 'Reusable kitchen and everyday household goods',
    unit_category: 'COUNT',
    base_unit: 'bottle',
    pricing_unit: 'bottle',
    price: 1990,
    usual_price: 2300,
    our_price: 1990,
    wholesale_price: 1790,
    cost_price: 1300,
    quantity: 15,
    low_stock_threshold: 4,
  },
  {
    name: 'Aloe Vera Shampoo 250ml',
    sku: 'PC-SHAMPOO-250-001',
    category: 'Personal Care',
    categoryDescription: 'Hair care, skincare, and personal hygiene products',
    unit_category: 'COUNT',
    base_unit: 'bottle',
    pricing_unit: 'bottle',
    price: 850,
    usual_price: 980,
    our_price: 850,
    wholesale_price: 760,
    cost_price: 580,
    quantity: 20,
    low_stock_threshold: 5,
  },
]

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed sample products in production.')
  }

  const result = await prisma.$transaction(async (tx) => {
    const categoryIds = new Map()
    for (const product of products) {
      const category = await tx.category.upsert({
        where: { name: product.category },
        update: {},
        create: { name: product.category, description: product.categoryDescription },
        select: { id: true },
      })
      categoryIds.set(product.category, category.id)
    }

    const created = []
    const skipped = []
    for (const product of products) {
      const existing = await tx.product.findUnique({ where: { sku: product.sku }, select: { id: true } })
      if (existing) {
        skipped.push(product.sku)
        continue
      }

      const { category, categoryDescription, ...data } = product
      await tx.product.create({ data: { ...data, category_id: categoryIds.get(category) } })
      created.push(product.sku)
    }
    return { created, skipped }
  })

  console.log(JSON.stringify({ database: 'configured development database', ...result }, null, 2))
}

main()
  .catch((error) => {
    console.error('Product seed failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
