const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')

async function listVariations({ page, per_page, search } = {}) {
  const where = {}
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: 'insensitive' }
  }

  if (page !== undefined || per_page !== undefined) {
    const pageNum = parseInt(page, 10) || 1
    const take = Math.min(parseInt(per_page, 10) || 20, 100)
    const skip = (pageNum - 1) * take

    const [variations, total] = await Promise.all([
      prisma.variation.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          values: {
            orderBy: { created_at: 'asc' },
          },
        },
      }),
      prisma.variation.count({ where }),
    ])

    return {
      variations,
      total,
      page: pageNum,
      per_page: take,
      total_pages: Math.ceil(total / take),
    }
  }

  const variations = await prisma.variation.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      values: {
        orderBy: { created_at: 'asc' },
      },
    },
  })

  return { variations, total: variations.length }
}

async function getVariationById(id) {
  const variation = await prisma.variation.findUnique({
    where: { id },
    include: {
      values: {
        orderBy: { created_at: 'asc' },
      },
    },
  })
  if (!variation) throw new NotFoundError('Variation not found')
  return variation
}

function normalizeValues(values) {
  if (!values || !Array.isArray(values)) return []
  const seen = new Set()
  const result = []
  for (const item of values) {
    const val = typeof item === 'string' ? item.trim() : (item?.value ? String(item.value).trim() : '')
    if (val && !seen.has(val.toLowerCase())) {
      seen.add(val.toLowerCase())
      result.push(val)
    }
  }
  return result
}

async function createVariation(data) {
  const name = String(data.name || '').trim()
  if (!name) {
    throw new ValidationError('Variation name is required', [{ field: 'name', message: 'Variation name is required' }])
  }

  const existing = await prisma.variation.findUnique({ where: { name } })
  if (existing) {
    throw new ConflictError('Variation name already exists', [{ field: 'name', message: 'Variation name already exists' }])
  }

  const rawValues = Array.isArray(data.values) ? data.values : []
  const cleanValues = normalizeValues(rawValues)
  if (cleanValues.length === 0) {
    throw new ValidationError('Variation must have at least one valid value', [
      { field: 'values', message: 'At least one variation value is required' },
    ])
  }

  return prisma.variation.create({
    data: {
      name,
      values: {
        create: cleanValues.map((v) => ({ value: v })),
      },
    },
    include: {
      values: {
        orderBy: { created_at: 'asc' },
      },
    },
  })
}

async function updateVariation(id, data) {
  const existing = await prisma.variation.findUnique({
    where: { id },
    include: { values: true },
  })
  if (!existing) throw new NotFoundError('Variation not found')

  const name = data.name !== undefined ? String(data.name).trim() : undefined
  if (name !== undefined && !name) {
    throw new ValidationError('Variation name cannot be empty', [
      { field: 'name', message: 'Variation name cannot be empty' },
    ])
  }

  if (name && name !== existing.name) {
    const conflict = await prisma.variation.findUnique({ where: { name } })
    if (conflict) {
      throw new ConflictError('Variation name already exists', [
        { field: 'name', message: 'Variation name already exists' },
      ])
    }
  }

  return prisma.$transaction(async (tx) => {
    if (data.values !== undefined) {
      const cleanValues = normalizeValues(data.values)
      if (cleanValues.length === 0) {
        throw new ValidationError('Variation must have at least one valid value', [
          { field: 'values', message: 'At least one variation value is required' },
        ])
      }

      // Delete existing values and recreate clean ones
      await tx.variationValue.deleteMany({ where: { variation_id: id } })
      await tx.variationValue.createMany({
        data: cleanValues.map((v) => ({ variation_id: id, value: v })),
      })
    }

    if (name) {
      await tx.variation.update({
        where: { id },
        data: { name },
      })
    }

    return tx.variation.findUnique({
      where: { id },
      include: {
        values: {
          orderBy: { created_at: 'asc' },
        },
      },
    })
  }, { maxWait: 10000, timeout: 30000 })
}

async function deleteVariation(id) {
  const existing = await prisma.variation.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Variation not found')

  await prisma.variation.delete({ where: { id } })
  return { id }
}

module.exports = {
  listVariations,
  getVariationById,
  createVariation,
  updateVariation,
  deleteVariation,
}
