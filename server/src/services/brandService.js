const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')

async function listBrands({ page, per_page, search } = {}) {
  const where = {}
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: 'insensitive' }
  }

  if (page !== undefined || per_page !== undefined) {
    const pageNum = parseInt(page, 10) || 1
    const take = Math.min(parseInt(per_page, 10) || 20, 100)
    const skip = (pageNum - 1) * take

    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      prisma.brand.count({ where }),
    ])

    return {
      brands,
      total,
      page: pageNum,
      per_page: take,
      total_pages: Math.ceil(total / take),
    }
  }

  // Non-paginated (e.g. for dropdowns)
  const brands = await prisma.brand.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  return { brands, total: brands.length }
}

async function getBrandById(id) {
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  })
  if (!brand) throw new NotFoundError('Brand not found')
  return brand
}

async function createBrand(data) {
  const name = String(data.name || '').trim()
  if (!name) {
    throw new ValidationError('Brand name is required', [{ field: 'name', message: 'Brand name is required' }])
  }

  const existing = await prisma.brand.findUnique({ where: { name } })
  if (existing) {
    throw new ConflictError('Brand name already exists', [{ field: 'name', message: 'Brand name already exists' }])
  }

  return prisma.brand.create({
    data: {
      name,
      description: data.description ? String(data.description).trim() : null,
    },
    include: { _count: { select: { products: true } } },
  })
}

async function updateBrand(id, data) {
  const existing = await prisma.brand.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Brand not found')

  const name = data.name !== undefined ? String(data.name).trim() : undefined
  if (name !== undefined && !name) {
    throw new ValidationError('Brand name cannot be empty', [{ field: 'name', message: 'Brand name cannot be empty' }])
  }

  if (name && name !== existing.name) {
    const conflict = await prisma.brand.findUnique({ where: { name } })
    if (conflict) {
      throw new ConflictError('Brand name already exists', [{ field: 'name', message: 'Brand name already exists' }])
    }
  }

  return prisma.brand.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(data.description !== undefined && {
        description: data.description ? String(data.description).trim() : null,
      }),
    },
    include: { _count: { select: { products: true } } },
  })
}

async function deleteBrand(id) {
  const existing = await prisma.brand.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Brand not found')

  const affectedCount = await prisma.product.count({ where: { brand_id: id } })

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { brand_id: id },
      data: { brand_id: null },
    })
    await tx.brand.delete({ where: { id } })
  }, { maxWait: 10000, timeout: 30000 })

  return { id, affected_products: affectedCount }
}

module.exports = {
  listBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
}
