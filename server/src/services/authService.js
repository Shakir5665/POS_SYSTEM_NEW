const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prismaClient')
const { UnauthorizedError, NotFoundError, ForbiddenError, ConflictError, ValidationError } = require('../utils/errors')
const { assertAccessEnabled, GLOBAL_CONTROL_ID } = require('./systemControlService')

// After this many failed logins in a row, the account is locked
const BCRYPT_COST = 12
const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 30

async function logAuthEvent(userId, eventType, ipAddress, userAgent, details) {
  await prisma.authLog.create({
    data: {
      user_id: userId || null,
      event_type: eventType,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      details: details || null,
    },
  })
}

function generateAccessToken(userId, role, tokenVersion = 0) {
  return jwt.sign({ userId, role, tokenVersion }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  })
}

function generateRefreshToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  })
}

async function login(username, password, ipAddress, userAgent) {
  const user = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
    },
  })

  if (!user) {
    await logAuthEvent(null, 'LOGIN_FAILED', ipAddress, userAgent, `Unknown username: ${username}`)
    throw new UnauthorizedError('Invalid credentials')
  }

  // Check account lock
  const now = new Date()
  if (user.locked_until && user.locked_until > now) {
    await logAuthEvent(user.id, 'LOGIN_BLOCKED', ipAddress, userAgent, 'Account locked')
    const minutesLeft = Math.ceil((user.locked_until - now) / 60000)
    throw new UnauthorizedError(
      `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} or contact an administrator.`
    )
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash)

  if (!passwordValid) {
    // Once a lock has expired, start counting failed attempts again
    const previousFails = user.locked_until ? 0 : user.failed_login_attempts
    const newFailCount = previousFails + 1
    const updateData = { failed_login_attempts: newFailCount, locked_until: null }

    if (newFailCount >= MAX_FAILED_LOGINS) {
      updateData.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      await prisma.user.update({ where: { id: user.id }, data: updateData })
      await logAuthEvent(user.id, 'ACCOUNT_LOCKED', ipAddress, userAgent, `Locked after ${newFailCount} failed attempts`)
    } else {
      await prisma.user.update({ where: { id: user.id }, data: updateData })
      await logAuthEvent(user.id, 'LOGIN_FAILED', ipAddress, userAgent, `Failed attempt ${newFailCount}`)
    }

    throw new UnauthorizedError('Invalid credentials')
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is deactivated')
  }

  await assertAccessEnabled(user)

  // Reset failed attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failed_login_attempts: 0, locked_until: null },
  })

  const accessToken = generateAccessToken(user.id, user.role, user.token_version)
  const refreshToken = generateRefreshToken(user.id, user.token_version)

  await logAuthEvent(user.id, 'LOGIN_SUCCESS', ipAddress, userAgent, null)

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
  }
}

async function logout(userId, ipAddress, userAgent) {
  if (userId) {
    await logAuthEvent(userId, 'LOGOUT', ipAddress, userAgent, null)
  }
  return true
}

async function refreshToken(tokenFromCookie) {
  if (!tokenFromCookie) {
    throw new UnauthorizedError('No refresh token')
  }

  let payload
  try {
    payload = jwt.verify(tokenFromCookie, process.env.JWT_REFRESH_SECRET)
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, is_active: true, token_version: true },
  })

  if (!user || !user.is_active) {
    throw new UnauthorizedError('User not found or inactive')
  }

  const tokenVersion = Number.isInteger(payload.tokenVersion) ? payload.tokenVersion : 0
  if (user.token_version !== tokenVersion) {
    throw new UnauthorizedError('Session is no longer valid')
  }

  await assertAccessEnabled(user)

  const accessToken = generateAccessToken(user.id, user.role, user.token_version)

  await logAuthEvent(user.id, 'TOKEN_REFRESH', null, null, null)

  return { accessToken }
}

async function updateSuperAdminAccount(userId, { current_password, username, password }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')
  if (user.role !== 'SUPERADMIN') throw new ForbiddenError('Insufficient permissions')

  const control = await prisma.systemControl.findUnique({
    where: { id: GLOBAL_CONTROL_ID },
    select: { owner_user_id: true },
  })
  if (control?.owner_user_id !== userId) throw new ForbiddenError('Owner account is not configured')

  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    throw new UnauthorizedError('Current password is incorrect')
  }

  const data = { token_version: { increment: 1 } }
  const changedFields = []

  if (username !== undefined && username.trim() !== user.username) {
    const normalizedUsername = username.trim()
    const existing = await prisma.user.findFirst({
      where: { username: { equals: normalizedUsername, mode: 'insensitive' }, id: { not: userId } },
      select: { id: true },
    })
    if (existing) throw new ConflictError('Username already exists')
    data.username = normalizedUsername
    changedFields.push('username')
  }

  if (password !== undefined) {
    if (password.length < 12) throw new ValidationError('New password must be at least 12 characters')
    data.password_hash = await bcrypt.hash(password, BCRYPT_COST)
    changedFields.push('password')
  }

  if (changedFields.length === 0) {
    throw new ValidationError('Enter a new username or password')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const savedUser = await tx.user.update({ where: { id: userId }, data })
    await tx.authLog.create({
      data: {
        user_id: userId,
        event_type: 'SUPERADMIN_CREDENTIALS_UPDATED',
        details: `Updated ${changedFields.join(' and ')}`,
      },
    })
    return savedUser
  })

  return {
    accessToken: generateAccessToken(updated.id, updated.role, updated.token_version),
    refreshToken: generateRefreshToken(updated.id, updated.token_version),
    user: {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      full_name: updated.full_name,
      role: updated.role,
    },
  }
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      full_name: true,
      role: true,
      is_active: true,
      created_at: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  return user
}

module.exports = { login, logout, refreshToken, getMe, updateSuperAdminAccount }
