require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const bcrypt = require('bcrypt')
const { randomUUID } = require('crypto')
const prisma = require('../src/utils/prismaClient')
const { GLOBAL_CONTROL_ID } = require('../src/services/systemControlService')

async function bootstrap() {
  const username = process.env.NEXTILL_OWNER_USERNAME?.trim()
  const password = process.env.NEXTILL_OWNER_PASSWORD

  if (!username || !password) {
    throw new Error('Owner credentials must be supplied through the process environment.')
  }
  if (username.length < 3 || username.length > 50) {
    throw new Error('Owner username must be 3 to 50 characters.')
  }
  if (password.length < 6) {
    throw new Error('Owner password must be at least 6 characters.')
  }

  await prisma.$transaction(async (tx) => {
    const control = await tx.systemControl.findUnique({ where: { id: GLOBAL_CONTROL_ID } })
    if (!control) throw new Error('System control migration must be applied before owner setup.')
    if (control.owner_user_id) throw new Error('System owner has already been configured.')

    const existingOwner = await tx.user.count({ where: { role: 'SUPERADMIN' } })
    if (existingOwner > 0) throw new Error('A Superadmin account already exists.')

    const usernameTaken = await tx.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (usernameTaken) throw new Error('That username is already in use.')

    const user = await tx.user.create({
      data: {
        username,
        email: `owner-${randomUUID()}@example.invalid`,
        password_hash: await bcrypt.hash(password, 12),
        full_name: 'System Owner',
        role: 'SUPERADMIN',
      },
    })

    const ownerAssigned = await tx.systemControl.updateMany({
      where: { id: GLOBAL_CONTROL_ID, owner_user_id: null },
      data: { owner_user_id: user.id },
    })
    if (ownerAssigned.count !== 1) throw new Error('System owner has already been configured.')

    await tx.authLog.create({
      data: { user_id: user.id, event_type: 'SUPERADMIN_BOOTSTRAPPED', details: 'System owner initialized' },
    })
  })

  console.log('System owner initialized.')
}

bootstrap()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
