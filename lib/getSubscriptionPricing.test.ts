import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: null as { user_type: string } | null,
  error: null as { message: string } | null,
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile, error: state.error }),
        }),
      }),
    }),
  },
}))

import { getSubscriptionPricing, PRO_PRICE_CENTAVOS, TESTER_PRICE_CENTAVOS } from '@/lib/getSubscriptionPricing'

beforeEach(() => {
  state.profile = { user_type: 'user' }
  state.error = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getSubscriptionPricing', () => {
  it('charges ₱999 for a normal account', async () => {
    await expect(getSubscriptionPricing('user-1')).resolves.toEqual({
      amountCentavos: PRO_PRICE_CENTAVOS,
      isTesterPricing: false,
    })
    expect(PRO_PRICE_CENTAVOS).toBe(99_900)
  })

  it('charges ₱5 for a tester', async () => {
    state.profile = { user_type: 'tester' }
    await expect(getSubscriptionPricing('user-1')).resolves.toEqual({
      amountCentavos: TESTER_PRICE_CENTAVOS,
      isTesterPricing: true,
    })
    expect(TESTER_PRICE_CENTAVOS).toBe(500)
  })

  it('falls back to ₱999 when the profile lookup fails', async () => {
    state.profile = null
    state.error = { message: 'db down' }
    await expect(getSubscriptionPricing('user-1')).resolves.toEqual({
      amountCentavos: 99_900,
      isTesterPricing: false,
    })
  })
})
