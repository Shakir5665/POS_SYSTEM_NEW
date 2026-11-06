const authService = require('../services/authService')
const userService = require('../services/userService')
const prisma = require('../utils/prismaClient')

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body
    const result = await authService.login(
      username,
      password,
      req.ip,
      req.headers['user-agent']
    )

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)

    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: 'Login successful',
    })
  } catch (err) {
    next(err)
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user?.id, req.ip, req.headers['user-agent'])

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (err) {
    next(err)
  }
}

async function refresh(req, res, next) {
  try {
    const tokenFromCookie = req.cookies?.refreshToken
    const result = await authService.refreshToken(tokenFromCookie)

    res.status(200).json({
      success: true,
      data: { accessToken: result.accessToken },
      message: 'Token refreshed',
    })
  } catch (err) {
    next(err)
  }
}

async function register(req, res, next) {
  try {
    const { username, email, password, full_name, role } = req.body
    const count = await prisma.user.count()
    const assignedRole = count === 0 ? 'ADMIN' : (role && ['CASHIER', 'MANAGER', 'ADMIN'].includes(role) ? role : 'CASHIER')
    const user = await userService.createUser({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      full_name: full_name.trim(),
      role: assignedRole,
    })

    res.status(201).json({
      success: true,
      data: user,
      message: 'Registration successful! You can now sign in.',
    })
  } catch (err) {
    next(err)
  }
}

async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id)
    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { login, logout, refresh, getMe, register }
