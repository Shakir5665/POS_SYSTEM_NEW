require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, cashierUser, adminToken, cashierToken
let originalRows

async function login(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' })
  return res.body.data.accessToken
}

beforeAll(async () => {
  originalRows = await prisma.settings.findMany()
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: { username: 'settings_test_admin', email: 'settings_admin@test.com', password_hash, full_name: 'Settings Admin', role: 'ADMIN' },
  })
  cashierUser = await prisma.user.create({
    data: { username: 'settings_test_cashier', email: 'settings_cashier@test.com', password_hash, full_name: 'Settings Cashier', role: 'CASHIER' },
  })
  adminToken = await login('settings_test_admin')
  cashierToken = await login('settings_test_cashier')
})

afterAll(async () => {
  // Put receipt_footer back as it was (the only setting this file changes)
  const footer = originalRows.find((r) => r.key === 'receipt_footer')
  if (footer) await prisma.settings.update({ where: { key: 'receipt_footer' }, data: { value: footer.value } })
  else await prisma.settings.deleteMany({ where: { key: 'receipt_footer' } })
  const ids = [adminUser.id, cashierUser.id]
  await prisma.authLog.deleteMany({ where: { user_id: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

describe('GET /api/settings', () => {
  it('returns every setting, with defaults for missing keys, to any logged-in user', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${cashierToken}`)

    expect(res.status).toBe(200)
    for (const key of ['store_name', 'store_address', 'store_phone', 'tax_rate', 'loyalty_points_rate', 'currency_symbol', 'receipt_footer']) {
      expect(res.body.data).toHaveProperty(key)
    }
    // Compare only keys no other test file changes while this one runs
    for (const row of originalRows.filter((r) => !['tax_rate', 'loyalty_points_rate'].includes(r.key))) {
      expect(res.body.data[row.key]).toBe(row.value)
    }
  })

  it('requires login', async () => {
    expect((await request(app).get('/api/settings')).status).toBe(401)
  })
})

describe('PUT /api/settings', () => {
  it('saves known keys as strings and ignores unknown ones (admin)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receipt_footer: 12345, not_a_setting: 'x' })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Settings saved successfully')
    expect(res.body.data.receipt_footer).toBe('12345') // stored as a string
    expect(res.body.data).not.toHaveProperty('not_a_setting')
    expect(await prisma.settings.findUnique({ where: { key: 'not_a_setting' } })).toBeNull()
    expect((await prisma.settings.findUnique({ where: { key: 'receipt_footer' } })).value).toBe('12345')
  })

  it('is admin only', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${cashierToken}`).send({ receipt_footer: 'x' })
    expect(res.status).toBe(403)
  })
})
