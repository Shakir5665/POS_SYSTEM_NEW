const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError } = require('../utils/errors')

async function listCustomers({ page = 1, per_page = 20, search } = {}) {
  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const where = {}
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { sales: true } } },
    }),
    prisma.customer.count({ where }),
  ])

  return { customers, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

async function getCustomerById(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      _count: { select: { sales: true } },
    },
  })
  if (!customer) throw new NotFoundError('Customer not found')
  return customer
}

async function createCustomer(data) {
  if (data.phone) {
    const existing = await prisma.customer.findUnique({ where: { phone: data.phone } })
    if (existing) throw new ConflictError('Phone number already registered')
  }
  if (data.email) {
    const existing = await prisma.customer.findUnique({ where: { email: data.email } })
    if (existing) throw new ConflictError('Email already registered')
  }

  return prisma.customer.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
    },
  })
}

async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Customer not found')

  if (data.phone && data.phone !== existing.phone) {
    const conflict = await prisma.customer.findUnique({ where: { phone: data.phone } })
    if (conflict) throw new ConflictError('Phone number already registered')
  }
  if (data.email && data.email !== existing.email) {
    const conflict = await prisma.customer.findUnique({ where: { email: data.email } })
    if (conflict) throw new ConflictError('Email already registered')
  }

  return prisma.customer.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.address !== undefined && { address: data.address || null }),
    },
  })
}

async function getCustomerPurchases(id, { page = 1, per_page = 20 } = {}) {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) throw new NotFoundError('Customer not found')

  const skip = (page - 1) * per_page
  const take = Math.min(per_page, 100)

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where: { customer_id: id },
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { sale_items: true } },
        user: { select: { full_name: true } },
      },
    }),
    prisma.sale.count({ where: { customer_id: id } }),
  ])

  return { sales, total, page, per_page: take, total_pages: Math.ceil(total / take) }
}

module.exports = { listCustomers, getCustomerById, createCustomer, updateCustomer, getCustomerPurchases }
