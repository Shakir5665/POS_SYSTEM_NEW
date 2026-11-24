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

module.exports = {
  cloudinary,
  uploadToCloudinary,
}
