/**
 * The seed script deletes every row in every table before inserting sample
 * data, so it must never run against a production database by accident.
 */

/**
 * @param {object} env - usually process.env
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkSeedAllowed(env) {
  if (env.NODE_ENV === 'production' && env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    return {
      allowed: false,
      reason:
        'Refusing to seed: NODE_ENV is "production" and seeding deletes ALL data. ' +
        'If you really mean to wipe this database, set ALLOW_DESTRUCTIVE_SEED=true.',
    }
  }
  return { allowed: true }
}

/** "host:port/database" from a connection string, without the password. */
function describeDatabase(databaseUrl) {
  try {
    const url = new URL(databaseUrl)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
  } catch {
    return '(unknown database)'
  }
}

module.exports = { checkSeedAllowed, describeDatabase }
