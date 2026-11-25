const systemControlService = require('../services/systemControlService')
const authService = require('../services/authService')
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

async function getStatus(req, res, next) {
  try {
    const status = await systemControlService.getStatus()
    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
}

async function setAccess(req, res, next) {
  try {
    const status = await systemControlService.setAccessEnabled(
      req.body.access_enabled,
      req.user,
      req.ip,
      req.headers['user-agent']
    )
    res.json({ success: true, data: status, message: 'System access status updated' })
  } catch (err) {
    next(err)
  }
}

async function updateAccount(req, res, next) {
  try {
    const result = await authService.updateSuperAdminAccount(req.user.id, req.body)
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)
    res.json({
      success: true,
      data: { accessToken: result.accessToken, user: result.user },
      message: 'Account credentials updated',
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getStatus, setAccess, updateAccount }
