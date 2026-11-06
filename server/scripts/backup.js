require('dotenv').config()
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const backupDir = path.join(__dirname, '..', 'backups')
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const filename = `pos_backup_${timestamp}.dump`
const filepath = path.join(backupDir, filename)

try {
  execSync(`pg_dump "${process.env.DATABASE_URL}" -Fc -f "${filepath}"`)
  console.log(`Backup created: ${filepath}`)
} catch (err) {
  console.error('Backup failed:', err.message)
  process.exit(1)
}
