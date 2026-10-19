import { describe, expect, it } from 'vitest'
import { POST as validate } from '@/app/api/vouchers/validate/route'
import { POST as redeem } from '@/app/api/vouchers/redeem/route'

describe('retired voucher routes', () => {
  it('returns 410 and does not accept a code', async () => {
    for (const post of [validate, redeem]) {
      const res = await post(
        new Request('http://localhost/api/vouchers/validate', {
          method: 'POST',
          body: JSON.stringify({ code: 'FNDRUSER1299' }),
        })
      )
      expect(res.status).toBe(410)
      expect(await res.json()).toEqual({ error: 'Promo codes are no longer accepted.' })
    }
  })
})
