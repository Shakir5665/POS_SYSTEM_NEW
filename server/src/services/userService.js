const bcrypt = require('bcrypt')
const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors')

const BCRYPT_COST = 12

// Never return password hashes
const USER_FIELDS = {
  id: true,
  username: true,
  email: true,
  full_name: true,
  role: true,
  is_active: true,
  created_at: true,
  warehouse_id: true,
  assigned_warehouse: {
    select: { id: true, name: true, code: true },
  },
}

async function findUserOrThrow(id) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new NotFoundError('User not found')
  return user
}

/** All users, oldest first, with is_locked derived from locked_until. */
async function listUsers() {
  const users = await prisma.user.findMany({
    where: { role: { not: 'SUPERADMIN' } },
    select: { ...USER_FIELDS, locked_until: true },
    orderBy: { created_at: 'asc' },
  })
  const now = new Date()
  return users.map((u) => ({
    ...u,
    is_locked: u.locked_until ? new Date(u.locked_until) > now : false,
  }))
}

async function createUser({ username, email, password, full_name, role, warehouse_id }) {
  if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(role)) {
    throw new ValidationError('Only staff roles can be created here')
  }
  const normalizedUsername = username.trim()
  const normalizedEmail = email.trim().toLowerCase()
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: normalizedUsername, mode: 'insensitive' } },
        { email: { equals: normalizedEmail, mode: 'insensitive' } },
      ],
    },
  })
  if (existing) throw new ConflictError('Username or email already exists')
  const password_hash = await bcrypt.hash(password, BCRYPT_COST)
  return prisma.user.create({
    data: {
      username: normalizedUsername,
      email: normalizedEmail,
      password_hash,
      full_name,
      role,
      warehouse_id: warehouse_id || null,
    },
    select: USER_FIELDS,
  })
}

/** Update role, active status, full name, email and/or assigned branch. */
async function updateUser(id, { role, is_active, full_name, email, warehouse_id }) {
  const existing = await findUserOrThrow(id)
  if (existing.role === 'SUPERADMIN') {
    throw new ValidationError('Use the owner account controls to update the Superadmin account')
  }
  if (role !== undefined && !['ADMIN', 'MANAGER', 'CASHIER'].includes(role)) {
    throw new ValidationError('Only staff roles can be assigned here')
  }
  return prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(is_active !== undefined && { is_active }),
      ...(full_name && { full_name }),
      ...(email && { email }),
      ...(warehouse_id !== undefined && { warehouse_id: warehouse_id || null }),
    },
    select: USER_FIELDS,
  })
}

/** Set a new password; also unlocks the account. */
async function resetPassword(id, password) {
  const user = await findUserOrThrow(id)
  if (user.role === 'SUPERADMIN') {
    throw new ValidationError('Use the owner account controls to update the Superadmin password')
  }
  const password_hash = await bcrypt.hash(password, BCRYPT_COST)
  await prisma.user.update({
    where: { id },
    data: { password_hash, token_version: { increment: 1 }, failed_login_attempts: 0, locked_until: null },
  })
}

async function unlockUser(id) {
  const user = await findUserOrThrow(id)
  if (user.role === 'SUPERADMIN') throw new ValidationError('The owner account cannot be unlocked here')
  await prisma.user.update({ where: { id }, data: { failed_login_attempts: 0, locked_until: null } })
}

/** Permanently delete a staff account and reassign activity records to the acting Superadmin. */
async function deleteUser(id, currentUserId) {
  if (id === currentUserId) {
    throw new ValidationError('Cannot delete your own account')
  }
  const user = await findUserOrThrow(id)
  if (user.role === 'SUPERADMIN') throw new ValidationError('The owner account cannot be deleted here')

  return prisma.$transaction(async (tx) => {
    await tx.sale.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.purchase.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.expense.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.customerPayment.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.supplierPayment.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.inventoryLog.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.ownerTransaction.updateMany({ where: { user_id: id }, data: { user_id: currentUserId } })
    await tx.authLog.deleteMany({ where: { user_id: id } })
    return tx.user.delete({ where: { id } })
  })
}

module.exports = { listUsers, createUser, updateUser, resetPassword, unlockUser, deleteUser }
