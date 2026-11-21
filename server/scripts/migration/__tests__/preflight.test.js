'use strict'

const { runPreflight, parseConnectionUrl, detectProductionPatterns } = require('../preflight')

describe('Migration Preflight Checker', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  describe('parseConnectionUrl', () => {
    it('parses a standard PostgreSQL URL without exposing password', () => {
      const result = parseConnectionUrl('postgresql://user:secret@localhost:5432/mydb')
      expect(result).not.toBeNull()
      expect(result.user).toBe('user')
      expect(result.port).toBe('5432')
      expect(result.database).toBe('mydb')
      expect(result.masked).not.toContain('secret')
      expect(result.masked).toContain('****')
    })

    it('handles URLs with subdomains by masking the host', () => {
      const result = parseConnectionUrl('postgresql://u:p@db-host.render.com:5432/prod')
      expect(result.host).toContain('***')
      expect(result.database).toBe('prod')
    })

    it('returns null for empty input', () => {
      expect(parseConnectionUrl('')).toBeNull()
      expect(parseConnectionUrl(null)).toBeNull()
      expect(parseConnectionUrl(undefined)).toBeNull()
    })

    it('returns null for invalid URLs', () => {
      expect(parseConnectionUrl('not-a-url')).toBeNull()
    })

    it('defaults port to 5432 when not specified', () => {
      const result = parseConnectionUrl('postgresql://u:p@localhost/db')
      expect(result.port).toBe('5432')
    })
  })

  describe('detectProductionPatterns', () => {
    it('detects render.com hosts', () => {
      const patterns = detectProductionPatterns('db-instance.render.com')
      expect(patterns).toContain('render.com')
    })

    it('detects AWS RDS hosts', () => {
      const patterns = detectProductionPatterns('mydb.abc123.us-east-1.rds.amazonaws.com')
      expect(patterns).toContain('amazonaws.com')
      expect(patterns).toContain('rds.amazonaws.com')
    })

    it('returns empty for localhost', () => {
      const patterns = detectProductionPatterns('localhost')
      expect(patterns).toHaveLength(0)
    })

    it('returns empty for null input', () => {
      expect(detectProductionPatterns(null)).toHaveLength(0)
    })
  })

  describe('runPreflight', () => {
    it('fails when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL
      const result = runPreflight({ target: 'development', databaseUrl: undefined })
      expect(result.ok).toBe(false)
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('DATABASE_URL is not defined'),
      ]))
    })

    it('fails when no target is provided', () => {
      const result = runPreflight({ databaseUrl: 'postgresql://u:p@localhost:5432/db' })
      expect(result.ok).toBe(false)
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('No target classification'),
      ]))
    })

    it('fails for invalid target', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://u:p@localhost:5432/db',
        target: 'unknown',
      })
      expect(result.ok).toBe(false)
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('Invalid target'),
      ]))
    })

    it('passes for development target with localhost', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://user:pass@localhost:5432/dev_db',
        target: 'development',
      })
      expect(result.ok).toBe(true)
      expect(result.classification).toBe('development')
      expect(result.destructive_allowed).toBe(true)
      expect(result.connection.database).toBe('dev_db')
    })

    it('refuses destructive ops on production target', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://user:pass@localhost:5432/db',
        target: 'production',
      })
      expect(result.ok).toBe(true)
      expect(result.destructive_allowed).toBe(false)
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('PRODUCTION'),
      ]))
    })

    it('blocks development classification on production-like hosts', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://user:pass@db.render.com:5432/prod',
        target: 'development',
      })
      expect(result.ok).toBe(false)
      expect(result.destructive_allowed).toBe(false)
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('SAFETY BLOCK'),
      ]))
    })

    it('warns about staging target', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://user:pass@localhost:5432/staging',
        target: 'staging',
      })
      expect(result.ok).toBe(true)
      expect(result.destructive_allowed).toBe(false)
    })

    it('never includes password in connection output', () => {
      const result = runPreflight({
        databaseUrl: 'postgresql://admin:SuperSecret123!@localhost:5432/db',
        target: 'development',
      })
      const json = JSON.stringify(result)
      expect(json).not.toContain('SuperSecret123!')
    })
  })
})
