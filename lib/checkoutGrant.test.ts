import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

import { buildCheckoutMetadata, resolveCheckoutGrant, verifyPaidGrant } from '@/lib/checkoutGrant'
import { PRO_PRICE_CENTAVOS, TESTER_PRICE_CENTAVOS } from '@/lib/getSubscriptionPricing'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('resolveCheckoutGrant', () => {
  it('prices the only Pro product at ₱999', () => {
    expect(resolveCheckoutGrant(PRO_PRICE_CENTAVOS)).toEqual({
      grant: 'lifetime',
      amountCentavos: 99_900,
    })
    expect(PRO_PRICE_CENTAVOS).toBe(99_900)
  })

  it('keeps tester pricing at ₱5', () => {
    expect(resolveCheckoutGrant(TESTER_PRICE_CENTAVOS)).toEqual({
      grant: 'lifetime',
      amountCentavos: 500,
    })
  })

  it('rejects an amount that is not a server price', () => {
    expect(() => resolveCheckoutGrant(9900)).toThrow(/server price/)
    expect(() => resolveCheckoutGrant(129_900)).toThrow(/server price/)
  })

  it('stores the server grant and expected amount', () => {
    expect(
      buildCheckoutMetadata({
        userId: 'user-1',
        expectedAmountCentavos: PRO_PRICE_CENTAVOS,
      })
    ).toEqual({
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    })
  })
})

describe('verifyPaidGrant', () => {
  const retail = {
    grant: 'lifetime',
    expected_amount_centavos: '99900',
    plan: 'pro',
  }

  it('grants when the paid amount is the server price', () => {
    expect(verifyPaidGrant(retail, 99_900)).toEqual({
      ok: true,
      grant: 'lifetime',
      expectedAmountCentavos: 99_900,
    })
    expect(verifyPaidGrant({ grant: 'lifetime', expected_amount_centavos: '500' }, 500)).toEqual({
      ok: true,
      grant: 'lifetime',
      expectedAmountCentavos: 500,
    })
  })

  it('grants nothing when the paid amount does not match', () => {
    expect(verifyPaidGrant(retail, 9900)).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(verifyPaidGrant(retail, 500)).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(verifyPaidGrant(retail, null)).toEqual({ ok: false, reason: 'amount_mismatch' })
  })

  it('grants nothing for a retired monthly or annual grant, or the old founder price', () => {
    expect(verifyPaidGrant({ grant: 'monthly', expected_amount_centavos: '9900' }, 9900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
    expect(verifyPaidGrant({ grant: 'annual', expected_amount_centavos: '99900' }, 99_900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
    expect(verifyPaidGrant({ grant: 'lifetime', expected_amount_centavos: '129900' }, 129_900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
    expect(verifyPaidGrant({ grant: 'forever', expected_amount_centavos: '99900' }, 99_900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
  })

  it('grants nothing when grant metadata is missing', () => {
    expect(verifyPaidGrant({ plan: 'pro', plan_type: 'monthly' }, 99_900)).toEqual({
      ok: false,
      reason: 'missing_metadata',
    })
    expect(verifyPaidGrant(null, 99_900)).toEqual({ ok: false, reason: 'missing_metadata' })
  })
})
