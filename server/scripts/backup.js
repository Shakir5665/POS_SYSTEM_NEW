const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { execSync } = require('child_process')
const fs = require('fs')

const backupDir = path.join(__dirname, '..', 'backups')
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const filename = `pos_backup_${timestamp}.dump`
const filepath = path.join(backupDir, filename)

// Find pg_dump binary
let pgDumpCmd = 'pg_dump'
const pg18Dump = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe'
const pg17Dump = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe'
if (fs.existsSync(pg18Dump)) {
  pgDumpCmd = `"${pg18Dump}"`
} else if (fs.existsSync(pg17Dump)) {
  pgDumpCmd = `"${pg17Dump}"`
}

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment or server/.env')
  }
  execSync(`${pgDumpCmd} "${process.env.DATABASE_URL}" -Fc -f "${filepath}"`)
  console.log(`Backup created: ${filepath}`)
} catch (err) {
  console.error('Backup failed:', err.message)
  process.exit(1)
}
