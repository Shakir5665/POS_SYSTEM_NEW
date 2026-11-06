require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const request = require('supertest')
const app = require('../app')
const prisma = require('../utils/prismaClient')
const bcrypt = require('bcrypt')

let adminUser, managerUser, adminToken, managerToken
const createdIds = []

async function login(username, password = 'testpass123') {
  return request(app).post('/api/auth/login').send({ username, password })
}

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`)

beforeAll(async () => {
  const password_hash = await bcrypt.hash('testpass123', 4)
  adminUser = await prisma.user.create({
    data: { username: 'users_test_admin', email: 'users_admin@test.com', password_hash, full_name: 'Users Admin', role: 'ADMIN' },
  })
  managerUser = await prisma.user.create({
    data: { username: 'users_test_manager', email: 'users_manager@test.com', password_hash, full_name: 'Users Manager', role: 'MANAGER' },
  })
  adminToken = (await login('users_test_admin')).body.data.accessToken
  managerToken = (await login('users_test_manager')).body.data.accessToken
})

afterAll(async () => {
  const ids = [adminUser.id, managerUser.id, ...createdIds]
  await prisma.authLog.deleteMany({ where: { user_id: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

async function createUser(overrides = {}) {
  const res = await asAdmin(request(app).post('/api/users')).send({
    username: `users_test_${Date.now()}_${createdIds.length}`,
    email: `users_${Date.now()}_${createdIds.length}@test.com`,
    password: 'secret1',
    full_name: 'Created User',
    role: 'CASHIER',
    ...overrides,
  })
  if (res.body.data?.id) createdIds.push(res.body.data.id)
  return res
}

describe('/api/users', () => {
  it('is admin only', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(403)
  })

  it('lists users with is_locked and without password hashes', async () => {
    await prisma.user.update({ where: { id: managerUser.id }, data: { locked_until: new Date(Date.now() + 60000) } })

    const res = await asAdmin(request(app).get('/api/users'))

    expect(res.status).toBe(200)
    const manager = res.body.data.find((u) => u.id === managerUser.id)
    expect(manager.is_locked).toBe(true)
    expect(res.body.data.find((u) => u.id === adminUser.id).is_locked).toBe(false)
    for (const u of res.body.data) expect(u).not.toHaveProperty('password_hash')

    await prisma.user.update({ where: { id: managerUser.id }, data: { locked_until: null } })
  })

  it('creates a user who can log in, and rejects duplicates', async () => {
    const res = await createUser({ username: `users_test_new_${Date.now()}` })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ role: 'CASHIER', is_active: true })
    expect(res.body.data).not.toHaveProperty('password_hash')
    expect((await login(res.body.data.username, 'secret1')).status).toBe(200)

    const duplicate = await createUser({ username: res.body.data.username })
    expect(duplicate.status).toBe(409)
  })

  it('validates new users', async () => {
    const res = await asAdmin(request(app).post('/api/users')).send({ username: 'x', email: 'bad', password: '123', full_name: '', role: 'OWNER' })
    expect(res.status).toBe(422)
  })

  it('updates role, active status, name and email', async () => {
    const { id } = (await createUser()).body.data

    const res = await asAdmin(request(app).put(`/api/users/${id}`)).send({ role: 'MANAGER', is_active: false, full_name: 'Renamed', email: `renamed_${Date.now()}@test.com` })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ role: 'MANAGER', is_active: false, full_name: 'Renamed' })
  })

  it('resets a password and unlocks the account', async () => {
    const created = (await createUser()).body.data
    await prisma.user.update({ where: { id: created.id }, data: { failed_login_attempts: 5, locked_until: new Date(Date.now() + 60000) } })

    const res = await asAdmin(request(app).post(`/api/users/${created.id}/reset-password`)).send({ password: 'newpass1' })

    expect(res.status).toBe(200)
    expect((await login(created.username, 'newpass1')).status).toBe(200)
  })

  it('unlocks an account', async () => {
    const { id } = (await createUser()).body.data
    await prisma.user.update({ where: { id }, data: { failed_login_attempts: 5, locked_until: new Date(Date.now() + 60000) } })

    const res = await asAdmin(request(app).post(`/api/users/${id}/unlock`))

    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { id } })
    expect(user).toMatchObject({ failed_login_attempts: 0, locked_until: null })
  })

  it('returns 404 for an unknown user', async () => {
    const unknown = '00000000-0000-0000-0000-000000000000'
    expect((await asAdmin(request(app).put(`/api/users/${unknown}`)).send({ full_name: 'X' })).status).toBe(404)
    expect((await asAdmin(request(app).post(`/api/users/${unknown}/unlock`))).status).toBe(404)
    expect((await asAdmin(request(app).post(`/api/users/${unknown}/reset-password`)).send({ password: 'newpass1' })).status).toBe(404)
  })
})
