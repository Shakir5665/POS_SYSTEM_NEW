const settingsService = require('../services/settingsService')

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getAllSettings()
    res.json({ success: true, data: settings })
  } catch (err) {
    next(err)
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await settingsService.updateSettings(req.body)
    res.json({ success: true, data: settings, message: 'Settings saved successfully' })
  } catch (err) {
    next(err)
  }
}

module.exports = { getSettings, updateSettings }
