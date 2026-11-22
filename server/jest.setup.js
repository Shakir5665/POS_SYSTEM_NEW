// Runs before each test file. Jest only sets NODE_ENV=test when it is unset,
// so a shell that already exports NODE_ENV (e.g. after sourcing .env, which
// sets "development") would turn on behaviour the tests rely on being off,
// such as the login rate limiter. Always test as "test".
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b?schema=public'
process.env.ALLOW_ISOLATED_IMPORT = 'true'
jest.setTimeout(60000)

