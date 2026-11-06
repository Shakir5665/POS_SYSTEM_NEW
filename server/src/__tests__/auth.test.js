require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let testUser

beforeAll(async () => {
  // Create a test user
  const hash = await bcrypt.hash('testpass123', 12)
  testUser = await prisma.user.create({
    data: {
      username: 'testuser_auth',
      email: 'testuser_auth@test.com',
      password_hash: hash,
      full_name: 'Test User',
      role: 'CASHIER',
    },
  })
})

afterAll(async () => {
  // Clean up test user and their auth logs
  await prisma.authLog.deleteMany({ where: { user_id: testUser.id } })
  await prisma.user.delete({ where: { id: testUser.id } })
  await prisma.$disconnect()
})

describe('POST /api/auth/login', () => {
  it('returns 200 with accessToken on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth', password: 'testpass123' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeTruthy()
    expect(res.body.data.user.username).toBe('testuser_auth')
    // refresh token should be in cookie, not in body
    expect(res.body.data.refreshToken).toBeUndefined()
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 on unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent_xyz', password: 'anypassword' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 422 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'testpass123' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 422 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth' })

    expect(res.status).toBe(422)
  })
})

describe('GET /api/auth/me', () => {
  let accessToken

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth', password: 'testpass123' })
    accessToken = res.body.data.accessToken
  })

  it('returns 200 with user profile on valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe('testuser_auth')
    expect(res.body.data.password_hash).toBeUndefined()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken123')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/refresh', () => {
  it('returns 200 with new accessToken using valid refresh cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth', password: 'testpass123' })

    const cookies = loginRes.headers['set-cookie']

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies)

    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.data.accessToken).toBeTruthy()
  })

  it('returns 401 without refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser_auth', password: 'testpass123' })

    const accessToken = loginRes.body.data.accessToken

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(logoutRes.status).toBe(200)
    expect(logoutRes.body.success).toBe(true)
  })
})

describe('Account lockout', () => {
  let lockTestUser

  beforeAll(async () => {
    const hash = await bcrypt.hash('correctpass', 12)
    lockTestUser = await prisma.user.create({
      data: {
        username: 'locktest_user_xyz',
        email: 'locktest_xyz@test.com',
        password_hash: hash,
        full_name: 'Lock Test User',
        role: 'CASHIER',
      },
    })
  })

  afterAll(async () => {
    await prisma.authLog.deleteMany({ where: { user_id: lockTestUser.id } })
    await prisma.user.delete({ where: { id: lockTestUser.id } })
  })

  it('locks account for 30 minutes after 5 failed attempts', async () => {
    const before = Date.now()
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'locktest_user_xyz', password: 'wrongpassword' })
    }

    const locked = await prisma.user.findUnique({ where: { id: lockTestUser.id } })
    const lockMs = locked.locked_until.getTime() - before
    expect(lockMs).toBeGreaterThanOrEqual(30 * 60 * 1000)
    expect(lockMs).toBeLessThan(31 * 60 * 1000)
  })

  it('rejects login with correct password when account is locked', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'locktest_user_xyz', password: 'correctpass' })

    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/locked\. try again in 30 minutes/i)
  })

  it('starts counting again after a lock expires, so one typo does not relock', async () => {
    await prisma.user.update({
      where: { id: lockTestUser.id },
      data: { failed_login_attempts: 5, locked_until: new Date(Date.now() - 1000) },
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'locktest_user_xyz', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/invalid credentials/i)
    const user = await prisma.user.findUnique({ where: { id: lockTestUser.id } })
    expect(user.failed_login_attempts).toBe(1)
    expect(user.locked_until).toBeNull()

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ username: 'locktest_user_xyz', password: 'correctpass' })
    expect(ok.status).toBe(200)
  })
})
