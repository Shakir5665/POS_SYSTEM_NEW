const jwt = require('jsonwebtoken')
const prisma = require('../utils/prismaClient')
const { UnauthorizedError, ForbiddenError } = require('../utils/errors')

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }

    const token = authHeader.split(' ')[1]
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        role: true,
        is_active: true,
      },
    })

    if (!user || !user.is_active) {
      throw new UnauthorizedError('User not found or inactive')
    }

    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

function authorize(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles]
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'))
    }
    if (!allowed.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'))
    }
    next()
  }
}

module.exports = { authenticate, authorize }
