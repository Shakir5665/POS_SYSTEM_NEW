const prisma = require('../utils/prismaClient')

// Returned for any key that hasn't been saved yet; also the list of keys PUT accepts
const DEFAULT_SETTINGS = {
  store_name: 'My POS Store',
  store_address: '',
  store_phone: '',
  tax_rate: '0',
  loyalty_points_rate: '10',
  currency_symbol: 'LKR',
  receipt_footer: 'Thank you for your business!',
}

let settingsCache = null
let cacheTimestamp = 0
const CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 60 * 1000

function invalidateCache() {
  settingsCache = null
  cacheTimestamp = 0
}

/** All settings as { key: value }, with defaults for keys not saved yet. */
async function getAllSettings() {
  const now = Date.now()
  if (settingsCache && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return { ...settingsCache }
  }

  const rows = await prisma.settings.findMany()
  const settings = { ...DEFAULT_SETTINGS }
  rows.forEach((r) => { settings[r.key] = r.value })
  settingsCache = settings
  cacheTimestamp = now
  return { ...settings }
}

/** Get a single setting value, parsed as number if numeric, or defaultValue. */
async function getSettingValue(key, defaultValue) {
  const settings = await getAllSettings()
  if (settings[key] !== undefined) {
    const val = parseFloat(settings[key])
    return isNaN(val) ? settings[key] : val
  }
  return defaultValue !== undefined ? defaultValue : DEFAULT_SETTINGS[key]
}

/** Save the known keys from `values` (as strings) and return all settings. Unknown keys are ignored. */
async function updateSettings(values) {
  const allowed = Object.keys(DEFAULT_SETTINGS)
  const updates = Object.entries(values).filter(([k]) => allowed.includes(k))
  await Promise.all(
    updates.map(([key, value]) =>
      prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  )
  invalidateCache()
  return getAllSettings()
}

module.exports = {
  DEFAULT_SETTINGS,
  getAllSettings,
  getSettingValue,
  updateSettings,
  invalidateCache,
}
