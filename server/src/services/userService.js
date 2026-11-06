const bcrypt = require('bcrypt')
const prisma = require('../utils/prismaClient')
const { NotFoundError, ConflictError } = require('../utils/errors')

const BCRYPT_COST = 12

// Never return password hashes
const USER_FIELDS = { id: true, username: true, email: true, full_name: true, role: true, is_active: true, created_at: true }

async function findUserOrThrow(id) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new NotFoundError('User not found')
  return user
}

/** All users, oldest first, with is_locked derived from locked_until. */
async function listUsers() {
  const users = await prisma.user.findMany({
    select: { ...USER_FIELDS, locked_until: true },
    orderBy: { created_at: 'asc' },
  })
  const now = new Date()
  return users.map((u) => ({
    ...u,
    is_locked: u.locked_until ? new Date(u.locked_until) > now : false,
  }))
}

async function createUser({ username, email, password, full_name, role }) {
  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } })
  if (existing) throw new ConflictError('Username or email already exists')
  const password_hash = await bcrypt.hash(password, BCRYPT_COST)
  return prisma.user.create({
    data: { username, email, password_hash, full_name, role },
    select: USER_FIELDS,
  })
}

/** Update role, active status, full name and/or email. */
async function updateUser(id, { role, is_active, full_name, email }) {
  await findUserOrThrow(id)
  return prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(is_active !== undefined && { is_active }),
      ...(full_name && { full_name }),
      ...(email && { email }),
    },
    select: USER_FIELDS,
  })
}

/** Set a new password; also unlocks the account. */
async function resetPassword(id, password) {
  await findUserOrThrow(id)
  const password_hash = await bcrypt.hash(password, BCRYPT_COST)
  await prisma.user.update({ where: { id }, data: { password_hash, failed_login_attempts: 0, locked_until: null } })
}

async function unlockUser(id) {
  await findUserOrThrow(id)
  await prisma.user.update({ where: { id }, data: { failed_login_attempts: 0, locked_until: null } })
}

module.exports = { listUsers, createUser, updateUser, resetPassword, unlockUser }
