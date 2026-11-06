const { checkSeedAllowed, describeDatabase } = require('../../prisma/seedGuard')

describe('seed guard', () => {
  it('blocks seeding in production', () => {
    const result = checkSeedAllowed({ NODE_ENV: 'production' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/ALLOW_DESTRUCTIVE_SEED=true/)
  })

  it('allows production only with the explicit override', () => {
    expect(checkSeedAllowed({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'true' }).allowed).toBe(true)
    expect(checkSeedAllowed({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'yes' }).allowed).toBe(false)
  })

  it('allows development and test', () => {
    expect(checkSeedAllowed({ NODE_ENV: 'development' }).allowed).toBe(true)
    expect(checkSeedAllowed({ NODE_ENV: 'test' }).allowed).toBe(true)
    expect(checkSeedAllowed({}).allowed).toBe(true)
  })

  it('describes the target database without the password', () => {
    const described = describeDatabase('postgresql://pos:s3cret@db.example.com:5432/pos_db?schema=public')
    expect(described).toBe('db.example.com:5432/pos_db')
    expect(described).not.toMatch(/s3cret/)
  })
})
