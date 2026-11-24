const settingsService = require('../services/settingsService')
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary')
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
    // If the update is clearing or changing logo_url, clean up the old Cloudinary logo if requested
    if (req.body.logo_url !== undefined) {
      const currentSettings = await settingsService.getAllSettings()
      const currentLogo = currentSettings.logo_url

      if (currentLogo && currentLogo !== req.body.logo_url) {
        if (currentLogo.includes('cloudinary.com')) {
          await deleteFromCloudinary(currentLogo)
        } else if (currentLogo.startsWith('/uploads/branding/')) {
          const localPath = path.join(__dirname, '..', '..', currentLogo)
          if (fs.existsSync(localPath)) {
            try { fs.unlinkSync(localPath) } catch { /* ignore */ }
          }
        }
      }
    }

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

    // Retrieve previous logo to clean up from Cloudinary / disk
    const currentSettings = await settingsService.getAllSettings()
    const oldLogoUrl = currentSettings.logo_url

    let logoUrl = ''

    // If Cloudinary credentials are provided, upload directly to Cloudinary
    if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'nextill/branding',
        public_id: `store_logo_${Date.now()}`,
        overwrite: true,
      })
      logoUrl = result.secure_url || result.url

      // Once new logo is uploaded, permanently remove old logo from Cloudinary
      if (oldLogoUrl && oldLogoUrl.includes('cloudinary.com')) {
        await deleteFromCloudinary(oldLogoUrl)
      } else if (oldLogoUrl && oldLogoUrl.startsWith('/uploads/branding/')) {
        const oldLocalPath = path.join(__dirname, '..', '..', oldLogoUrl)
        if (fs.existsSync(oldLocalPath)) {
          try { fs.unlinkSync(oldLocalPath) } catch { /* ignore */ }
        }
      }
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

      // Remove previous local file if present
      if (oldLogoUrl && oldLogoUrl.startsWith('/uploads/branding/')) {
        const oldLocalPath = path.join(__dirname, '..', '..', oldLogoUrl)
        if (fs.existsSync(oldLocalPath)) {
          try { fs.unlinkSync(oldLocalPath) } catch { /* ignore */ }
        }
      } else if (oldLogoUrl && oldLogoUrl.includes('cloudinary.com')) {
        await deleteFromCloudinary(oldLogoUrl)
      }
    }

    // Persist new logo_url in settings database
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

async function removeLogo(req, res, next) {
  try {
    const currentSettings = await settingsService.getAllSettings()
    const oldLogoUrl = currentSettings.logo_url

    if (oldLogoUrl) {
      if (oldLogoUrl.includes('cloudinary.com')) {
        await deleteFromCloudinary(oldLogoUrl)
      } else if (oldLogoUrl.startsWith('/uploads/branding/')) {
        const oldLocalPath = path.join(__dirname, '..', '..', oldLogoUrl)
        if (fs.existsSync(oldLocalPath)) {
          try { fs.unlinkSync(oldLocalPath) } catch { /* ignore */ }
        }
      }
    }

    const updated = await settingsService.updateSettings({ logo_url: '' })
    res.json({
      success: true,
      data: { logo_url: '', settings: updated },
      message: 'Store logo removed successfully',
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getSettings, updateSettings, uploadLogo, removeLogo }
