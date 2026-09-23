import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import { authorizePaymongoWebhook } from './paymongoWebhookSecurity'
import { verifyWebhookSignature } from './paymongo'

const SECRET = 'whsec_test_existing_secret'
const BODY = '{"data":{"id":"evt_1","attributes":{"type":"payment.paid"}}}'

function sign(rawBody: string, secret: string, timestamp: number, mode: 'te' | 'li' = 'te') {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
  if (mode === 'te') return `t=${timestamp},te=${digest},li=`
  return `t=${timestamp},te=,li=${digest}`
}

describe('authorizePaymongoWebhook', () => {
  it('accepts a valid test-mode signature over the raw body', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY,
      signatureHeader: sign(BODY, SECRET, now, 'te'),
      nowSeconds: now,
    })
    expect(result.ok).toBe(true)
  })

  it('accepts a valid live-mode li signature', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY,
      signatureHeader: sign(BODY, SECRET, now, 'li'),
      nowSeconds: now,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid signature and does not treat it as authorized', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY,
      signatureHeader: sign(BODY, 'wrong_secret', now),
      nowSeconds: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe('Invalid signature')
    }
  })

  it('rejects when the raw body does not match the signature', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY + ' ',
      signatureHeader: sign(BODY, SECRET, now),
      nowSeconds: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it('trims the existing webhook secret so env whitespace does not fail verification', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = authorizePaymongoWebhook({
      webhookSecret: ` ${SECRET}\n`,
      rawBody: BODY,
      signatureHeader: sign(BODY, SECRET, now),
      nowSeconds: now,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects stale timestamps', () => {
    const now = Math.floor(Date.now() / 1000)
    const old = now - 301
    const result = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY,
      signatureHeader: sign(BODY, SECRET, old),
      nowSeconds: now,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe('Stale webhook')
    }
  })
})

describe('verifyWebhookSignature', () => {
  it('computes HMAC-SHA256(timestamp.body) as hex', () => {
    const timestamp = 1496734173
    const header = sign(BODY, SECRET, timestamp)
    expect(verifyWebhookSignature(BODY, header, SECRET).valid).toBe(true)
  })
})

describe('invalid webhook does not process payment', () => {
  it('does not run the payment handler when the signature is invalid', async () => {
    let processed = 0
    const now = Math.floor(Date.now() / 1000)
    const auth = authorizePaymongoWebhook({
      webhookSecret: SECRET,
      rawBody: BODY,
      signatureHeader: sign(BODY, 'attacker', now),
      nowSeconds: now,
    })
    if (auth.ok) {
      processed += 1
    }
    expect(auth.ok).toBe(false)
    expect(processed).toBe(0)
  })
})
