import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row, error: null }),
        }),
      }),
    }),
  },
}))

import { buildCheckoutMetadata, resolveCheckoutGrant, verifyPaidGrant } from '@/lib/checkoutGrant'
import { FOUNDER_FINAL_CENTAVOS, FOUNDER_PROMO_CODE } from '@/lib/founderPromo'
import { resolveVoucherForCheckout } from '@/lib/voucherForCheckout'

const RETAIL_MONTHLY = 9900
const TESTER_CENTAVOS = 500

function founderRow(overrides: Record<string, unknown> = {}) {
  return {
    code: FOUNDER_PROMO_CODE,
    type: 'fixed',
    value: 1299,
    is_active: true,
    expires_at: null,
    max_uses: 300,
    used_count: 0,
    ...overrides,
  }
}

beforeEach(() => {
  state.row = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('resolveCheckoutGrant', () => {
  it('gives lifetime at ₱1,299 when the applied voucher is the founder code', () => {
    expect(
      resolveCheckoutGrant({
        planType: 'monthly',
        baseCentavos: RETAIL_MONTHLY,
        promo: { type: 'fixed', value: 1299 },
        appliedPromoCode: FOUNDER_PROMO_CODE,
        context: 'test',
      })
    ).toEqual({ grant: 'lifetime', amountCentavos: FOUNDER_FINAL_CENTAVOS })
  })

  it('keeps tester pricing at ₱5 when no founder voucher was applied', () => {
    expect(
      resolveCheckoutGrant({
        planType: 'monthly',
        baseCentavos: TESTER_CENTAVOS,
        promo: null,
        appliedPromoCode: null,
        context: 'test',
      })
    ).toEqual({ grant: 'monthly', amountCentavos: TESTER_CENTAVOS })
  })

  it('still applies a non-founder discount once to the server base', () => {
    expect(
      resolveCheckoutGrant({
        planType: 'monthly',
        baseCentavos: RETAIL_MONTHLY,
        promo: { type: 'percentage', value: 10 },
        appliedPromoCode: 'SAVE10',
        context: 'test',
      })
    ).toEqual({ grant: 'monthly', amountCentavos: 8900 })
  })

  it('stores the server grant and expected amount, not an unapplied typed code', () => {
    const metadata = buildCheckoutMetadata({
      userId: 'user-1',
      planType: 'monthly',
      grant: 'monthly',
      expectedAmountCentavos: RETAIL_MONTHLY,
      appliedPromoCode: null,
    })
    expect(metadata).toMatchObject({
      user_id: 'user-1',
      plan: 'pro',
      plan_type: 'monthly',
      grant: 'monthly',
      expected_amount_centavos: '9900',
      promoCode: '',
    })
    expect(metadata.grant).not.toBe('lifetime')
  })
})

describe('voucher lookup before a grant is chosen', () => {
  it('a valid founder voucher under its cap resolves, and an invalid, expired, or capped code does not', async () => {
    state.row = founderRow()
    const valid = await resolveVoucherForCheckout(FOUNDER_PROMO_CODE)
    expect(valid?.applied.code).toBe(FOUNDER_PROMO_CODE)
    expect(
      resolveCheckoutGrant({
        planType: 'monthly',
        baseCentavos: RETAIL_MONTHLY,
        promo: valid?.promo ?? null,
        appliedPromoCode: valid?.applied.code ?? null,
        context: 'test',
      }).grant
    ).toBe('lifetime')

    for (const row of [
      null,
      founderRow({ is_active: false }),
      founderRow({ expires_at: '2020-01-01T00:00:00.000Z' }),
      founderRow({ used_count: 300, max_uses: 300 }),
    ]) {
      state.row = row
      const resolved = await resolveVoucherForCheckout(FOUNDER_PROMO_CODE)
      expect(resolved).toBeNull()
      expect(
        resolveCheckoutGrant({
          planType: 'monthly',
          baseCentavos: RETAIL_MONTHLY,
          promo: null,
          appliedPromoCode: resolved?.applied.code ?? null,
          context: 'test',
        })
      ).toEqual({ grant: 'monthly', amountCentavos: RETAIL_MONTHLY })
    }
  })
})

describe('verifyPaidGrant', () => {
  const lifetimeMeta = {
    grant: 'lifetime',
    expected_amount_centavos: String(FOUNDER_FINAL_CENTAVOS),
    plan_type: 'monthly',
    promoCode: FOUNDER_PROMO_CODE,
  }

  it('grants lifetime only when the paid amount is the founder price', () => {
    expect(verifyPaidGrant(lifetimeMeta, FOUNDER_FINAL_CENTAVOS)).toMatchObject({
      ok: true,
      grant: 'lifetime',
      expectedAmountCentavos: FOUNDER_FINAL_CENTAVOS,
    })
  })

  it('does not grant lifetime for a typed founder code paying ₱99', () => {
    expect(
      verifyPaidGrant(
        {
          grant: 'monthly',
          expected_amount_centavos: '9900',
          plan_type: 'monthly',
          promoCode: FOUNDER_PROMO_CODE,
        },
        9900
      )
    ).toMatchObject({ ok: true, grant: 'monthly', planType: 'monthly' })
  })

  it('grants nothing when the paid amount does not match', () => {
    expect(verifyPaidGrant(lifetimeMeta, 9900)).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(verifyPaidGrant(lifetimeMeta, null)).toEqual({ ok: false, reason: 'amount_mismatch' })
  })

  it('grants nothing when grant metadata is missing or malformed', () => {
    expect(verifyPaidGrant({ promoCode: FOUNDER_PROMO_CODE, plan_type: 'monthly' }, 9900)).toEqual({
      ok: false,
      reason: 'missing_metadata',
    })
    expect(verifyPaidGrant({ grant: 'lifetime', expected_amount_centavos: '9900' }, 9900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
    expect(verifyPaidGrant({ grant: 'forever', expected_amount_centavos: '9900' }, 9900)).toEqual({
      ok: false,
      reason: 'malformed_metadata',
    })
    expect(verifyPaidGrant(null, 9900)).toEqual({ ok: false, reason: 'missing_metadata' })
  })

  it('uses the grant, not a conflicting plan_type, for monthly access', () => {
    expect(
      verifyPaidGrant(
        { grant: 'monthly', expected_amount_centavos: '500', plan_type: 'annual' },
        500
      )
    ).toMatchObject({ ok: true, grant: 'monthly', planType: 'monthly', expectedAmountCentavos: 500 })
  })
})
