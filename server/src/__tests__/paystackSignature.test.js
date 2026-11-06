const crypto = require('crypto')

const SECRET = 'sk_test_signature_check'

function loadService() {
  let service
  jest.isolateModules(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET
    service = require('../services/paystackService')
  })
  return service
}

const sign = (body, secret = SECRET) => crypto.createHmac('sha512', secret).update(body).digest('hex')

describe('validateWebhookSignature', () => {
  const originalSecret = process.env.PAYSTACK_SECRET_KEY
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'POS-1' } })
  let validateWebhookSignature

  beforeAll(() => {
    ;({ validateWebhookSignature } = loadService())
  })

  afterAll(() => {
    process.env.PAYSTACK_SECRET_KEY = originalSecret
  })

  it('accepts the correct signature', () => {
    expect(validateWebhookSignature(body, sign(body))).toBe(true)
  })

  it('rejects a signature made with another key', () => {
    expect(validateWebhookSignature(body, sign(body, 'sk_test_other'))).toBe(false)
  })

  it('rejects a signature for a different body', () => {
    expect(validateWebhookSignature(body, sign(body + ' '))).toBe(false)
  })

  it('rejects a missing, empty or wrong-length signature without throwing', () => {
    expect(validateWebhookSignature(body, undefined)).toBe(false)
    expect(validateWebhookSignature(body, '')).toBe(false)
    expect(validateWebhookSignature(body, sign(body).slice(0, -2))).toBe(false)
    expect(validateWebhookSignature(body, ['array'])).toBe(false)
  })

  it('rejects a missing body', () => {
    expect(validateWebhookSignature(undefined, sign(''))).toBe(false)
  })

  it('rejects everything when no secret key is configured', () => {
    let service
    jest.isolateModules(() => {
      delete process.env.PAYSTACK_SECRET_KEY
      service = require('../services/paystackService')
    })
    expect(service.validateWebhookSignature(body, sign(body))).toBe(false)
  })
})
