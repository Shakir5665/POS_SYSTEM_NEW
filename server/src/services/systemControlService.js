const prisma = require('../utils/prismaClient')
const { SystemAccessPausedError, NotFoundError } = require('../utils/errors')

const GLOBAL_CONTROL_ID = 'global'

async function getStatus() {
  const control = await prisma.systemControl.findUnique({
    where: { id: GLOBAL_CONTROL_ID },
    select: {
      access_enabled: true,
      owner_user_id: true,
      updated_by_user_id: true,
      updated_at: true,
      updated_by: { select: { username: true, full_name: true } },
    },
  })

  if (!control) throw new NotFoundError('System control settings are not initialized')

  return {
    access_enabled: control.access_enabled,
    owner_user_id: control.owner_user_id,
    updated_by_user_id: control.updated_by_user_id,
    updated_by: control.updated_by,
    updated_at: control.updated_at,
  }
}

async function assertAccessEnabled(user) {
  if (user?.role === 'SUPERADMIN') return

  const state = await prisma.systemControl.findUnique({
    where: { id: GLOBAL_CONTROL_ID },
    select: { access_enabled: true },
  })

  if (!state) throw new NotFoundError('System control settings are not initialized')
  if (!state.access_enabled) throw new SystemAccessPausedError()
}

async function setAccessEnabled(accessEnabled, actor, ipAddress, userAgent) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.systemControl.findUnique({ where: { id: GLOBAL_CONTROL_ID } })
    if (!current) throw new NotFoundError('System control settings are not initialized')

    if (current.access_enabled === accessEnabled) return current

    await tx.systemControl.update({
      where: { id: GLOBAL_CONTROL_ID },
      data: {
        access_enabled: accessEnabled,
        updated_by_user_id: actor.id,
      },
    })

    await tx.authLog.create({
      data: {
        user_id: actor.id,
        event_type: accessEnabled ? 'SYSTEM_ACCESS_RESTORED' : 'SYSTEM_ACCESS_PAUSED',
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        details: accessEnabled ? 'System access restored' : 'System access paused',
      },
    })
  })

  return getStatus()
}

async function assignOwner(tx, ownerId) {
  const result = await tx.systemControl.updateMany({
    where: { id: GLOBAL_CONTROL_ID, owner_user_id: null },
    data: { owner_user_id: ownerId },
  })
  return result.count === 1
}

module.exports = {
  GLOBAL_CONTROL_ID,
  getStatus,
  assertAccessEnabled,
  setAccessEnabled,
  assignOwner,
}
