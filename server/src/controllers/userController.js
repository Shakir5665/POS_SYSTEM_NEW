const userService = require('../services/userService')

async function listUsers(req, res, next) {
  try {
    const data = await userService.listUsers()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

async function createUser(req, res, next) {
  try {
    const user = await userService.createUser(req.body)
    res.status(201).json({ success: true, data: user, message: 'User created successfully' })
  } catch (err) {
    next(err)
  }
}

async function updateUser(req, res, next) {
  try {
    const updated = await userService.updateUser(req.params.id, req.body)
    res.json({ success: true, data: updated, message: 'User updated successfully' })
  } catch (err) {
    next(err)
  }
}

async function resetPassword(req, res, next) {
  try {
    await userService.resetPassword(req.params.id, req.body.password)
    res.json({ success: true, message: 'Password reset successfully' })
  } catch (err) {
    next(err)
  }
}

async function unlockUser(req, res, next) {
  try {
    await userService.unlockUser(req.params.id)
    res.json({ success: true, message: 'Account unlocked successfully' })
  } catch (err) {
    next(err)
  }
}

module.exports = { listUsers, createUser, updateUser, resetPassword, unlockUser }
