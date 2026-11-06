const prisma = require('../utils/prismaClient')

// Returned for any key that hasn't been saved yet; also the list of keys PUT accepts
const DEFAULT_SETTINGS = {
  store_name: 'My POS Store',
  store_address: '',
  store_phone: '',
  tax_rate: '0',
  loyalty_points_rate: '10',
  currency_symbol: 'GH₵',
  receipt_footer: 'Thank you for your business!',
}

/** All settings as { key: value }, with defaults for keys not saved yet. */
async function getAllSettings() {
  const rows = await prisma.settings.findMany()
  const settings = { ...DEFAULT_SETTINGS }
  rows.forEach((r) => { settings[r.key] = r.value })
  return settings
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
  return getAllSettings()
}

module.exports = { DEFAULT_SETTINGS, getAllSettings, updateSettings }
