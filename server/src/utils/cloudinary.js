const cloudinary = require('cloudinary').v2

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

/**
 * Upload a local file buffer or path to Cloudinary
 * @param {Buffer|string} fileInput - Buffer or file path
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
function uploadToCloudinary(fileInput, options = {}) {
  const defaultOptions = {
    folder: 'nextill/branding',
    resource_type: 'image',
    ...options,
  }

  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(fileInput)) {
      const uploadStream = cloudinary.uploader.upload_stream(
        defaultOptions,
        (error, result) => {
          if (error) return reject(error)
          resolve(result)
        }
      )
      uploadStream.end(fileInput)
    } else {
      cloudinary.uploader.upload(fileInput, defaultOptions, (error, result) => {
        if (error) return reject(error)
        resolve(result)
      })
    }
  })
}

/**
 * Extract Cloudinary public_id from a secure_url or url
 * e.g. "https://res.cloudinary.com/demo/image/upload/v1234567/nextill/branding/store_logo_123.png"
 * returns "nextill/branding/store_logo_123"
 * @param {string} url - Cloudinary image URL
 * @returns {string|null} public_id or null
 */
function extractPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  if (!url.includes('cloudinary.com')) return null

  try {
    const parts = url.split('/upload/')
    if (parts.length < 2) return null
    // parts[1] might look like "v1234567/nextill/branding/store_logo_123.png" or "nextill/branding/store_logo_123.png"
    let pathPart = parts[1]
    // Strip version prefix if present (e.g., "v1234567/")
    pathPart = pathPart.replace(/^v\d+\//, '')
    // Strip file extension
    const lastDotIndex = pathPart.lastIndexOf('.')
    if (lastDotIndex !== -1) {
      pathPart = pathPart.substring(0, lastDotIndex)
    }
    return pathPart || null
  } catch {
    return null
  }
}

/**
 * Permanently delete an image from Cloudinary by its public_id or URL
 * @param {string} publicIdOrUrl - Cloudinary public_id or full Cloudinary URL
 * @param {object} options - Options (resource_type, invalidate, etc.)
 * @returns {Promise<object>} Deletion result
 */
async function deleteFromCloudinary(publicIdOrUrl, options = {}) {
  if (!publicIdOrUrl) return { result: 'not_found' }
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return { result: 'skipped_no_credentials' }
  }

  let publicId = publicIdOrUrl
  if (publicIdOrUrl.includes('cloudinary.com')) {
    publicId = extractPublicIdFromUrl(publicIdOrUrl)
  }

  if (!publicId) return { result: 'invalid_id' }

  return new Promise((resolve) => {
    cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image',
        invalidate: true,
        ...options,
      },
      (error, result) => {
        if (error) {
          console.warn('[Cloudinary Delete Warning]:', error.message || error)
          return resolve({ result: 'error', error: error.message })
        }
        resolve(result)
      }
    )
  })
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
  extractPublicIdFromUrl,
  deleteFromCloudinary,
}
