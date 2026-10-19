import { describe, expect, it } from 'vitest'
import { POST as createCheckout } from '@/app/api/payments/create-checkout/route'
import { POST as createPaymongoCheckout } from '@/app/api/paymongo/create-checkout/route'

describe('retired checkout routes', () => {
  it('returns 410 and does not create a checkout', async () => {
    for (const post of [createCheckout, createPaymongoCheckout]) {
      const res = await post(
        new Request('http://localhost/api/payments/create-checkout', {
          method: 'POST',
          body: JSON.stringify({ planType: 'annual', amount: 100, promoCode: 'FNDRUSER1299' }),
        })
      )
      expect(res.status).toBe(410)
      expect(await res.json()).toEqual({ error: 'Checkout is no longer available.' })
    }
  })
})
