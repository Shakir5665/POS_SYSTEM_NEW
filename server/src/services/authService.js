const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prismaClient')
const { UnauthorizedError, NotFoundError } = require('../utils/errors')

// After this many failed logins in a row, the account is locked
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

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  })
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
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

  // Reset failed attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failed_login_attempts: 0, locked_until: null },
  })

  const accessToken = generateAccessToken(user.id, user.role)
  const refreshToken = generateRefreshToken(user.id)

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
    select: { id: true, role: true, is_active: true },
  })

  if (!user || !user.is_active) {
    throw new UnauthorizedError('User not found or inactive')
  }

  const accessToken = generateAccessToken(user.id, user.role)

  await logAuthEvent(user.id, 'TOKEN_REFRESH', null, null, null)

  return { accessToken }
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

module.exports = { login, logout, refreshToken, getMe }
