const settingsService = require('../services/settingsService')
const { uploadToCloudinary } = require('../utils/cloudinary')
const path = require('path')
const fs = require('fs')

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

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No image file uploaded' } })
    }

    let logoUrl = ''

    // If Cloudinary credentials are provided, upload directly to Cloudinary
    if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'nextill/branding',
        public_id: `store_logo_${Date.now()}`,
        overwrite: true,
      })
      logoUrl = result.secure_url || result.url
    } else {
      // Fallback: save to local uploads directory and serve url
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'branding')
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }
      const ext = path.extname(req.file.originalname) || '.png'
      const filename = `logo-${Date.now()}${ext}`
      const filePath = path.join(uploadsDir, filename)
      fs.writeFileSync(filePath, req.file.buffer)
      logoUrl = `/uploads/branding/${filename}`
    }

    // Persist logo_url in settings database
    const updated = await settingsService.updateSettings({ logo_url: logoUrl })

    res.json({
      success: true,
      data: { logo_url: logoUrl, settings: updated },
      message: 'Store logo uploaded successfully',
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getSettings, updateSettings, uploadLogo }
