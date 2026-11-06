// Uses the real Paystack signature check (not mocked), keyed with a test secret
process.env.PAYSTACK_SECRET_KEY = 'sk_test_request_limits'
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

const sign = (raw) => crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')

let manager, managerToken, category
const uploadedFiles = []

beforeAll(async () => {
  manager = await prisma.user.create({
    data: {
      username: 'limits_test_manager',
      email: 'limits_manager@test.com',
      password_hash: await bcrypt.hash('testpass123', 4),
      full_name: 'Limits Manager',
      role: 'MANAGER',
    },
  })
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'limits_test_manager', password: 'testpass123' })).body.data.accessToken
  category = await prisma.category.create({ data: { name: 'LimitsTest_Category' } })
})

afterAll(async () => {
  for (const file of uploadedFiles) fs.rmSync(path.join(__dirname, '../..', file), { force: true })
  await prisma.product.deleteMany({ where: { category_id: category.id } })
  await prisma.category.delete({ where: { id: category.id } })
  await prisma.authLog.deleteMany({ where: { user_id: manager.id } })
  await prisma.user.delete({ where: { id: manager.id } })
  await prisma.$disconnect()
})

const postJson = (url, raw) => request(app).post(url).set('Content-Type', 'application/json').send(raw)

describe('JSON body limit', () => {
  it('rejects a JSON body over 100kb with 413', async () => {
    const res = await postJson('/api/auth/login', JSON.stringify({ username: 'x'.repeat(150 * 1024), password: 'x' }))

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('still accepts a normal-sized body', async () => {
    const res = await postJson('/api/auth/login', JSON.stringify({ username: 'x'.repeat(50 * 1024), password: 'x' }))

    expect(res.status).toBe(401) // parsed and checked, just wrong credentials
  })

  it('returns 400 for malformed JSON instead of a server error', async () => {
    const res = await postJson('/api/auth/login', '{bad json')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })
})

describe('Paystack webhook raw body', () => {
  // Unusual spacing: the signature only matches if the exact bytes are checked,
  // not the body re-serialised after parsing
  const raw = '{ "event" :  "test.event",  "data": {} }'

  it('verifies the signature against the exact raw body', async () => {
    const res = await postJson('/api/payments/paystack/webhook', raw).set('x-paystack-signature', sign(raw))
    expect(res.status).toBe(200)
  })

  it('rejects a signature that does not match', async () => {
    const res = await postJson('/api/payments/paystack/webhook', raw).set('x-paystack-signature', sign(raw + ' '))
    expect(res.status).toBe(400)
  })
})

describe('product image upload', () => {
  it('still accepts an image larger than the JSON limit', async () => {
    const image = Buffer.alloc(300 * 1024, 0xff) // 300kb

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .field('name', 'Limits Test Product')
      .field('sku', `LIMITS-${Date.now()}`)
      .field('category_id', category.id)
      .field('price', '5')
      .attach('image', image, 'photo.png')

    expect(res.status).toBe(201)
    expect(res.body.data.image_url).toMatch(/^\/uploads\/products\/.+\.png$/)
    uploadedFiles.push(res.body.data.image_url)
    expect(fs.statSync(path.join(__dirname, '../..', res.body.data.image_url)).size).toBe(300 * 1024)
  })
})
