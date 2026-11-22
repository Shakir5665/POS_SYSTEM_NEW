'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = `import_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.xlsx`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  // Check extension and mime
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.xlsx') {
    const err = new Error('Invalid file type. Only .xlsx workbooks are permitted.');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
};

const uploadExcel = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit
  },
});

module.exports = uploadExcel;
