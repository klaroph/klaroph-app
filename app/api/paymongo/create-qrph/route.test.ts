import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'juan@example.com', user_metadata: {} } as { id: string; email: string; user_metadata: Record<string, string> } | null,
  profile: { user_type: 'user' } as { user_type: string } | null,
  subscription: null as Record<string, unknown> | null,
  intents: [] as { amount?: number; metadata?: Record<string, string> }[],
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.profile, error: null }),
            }),
          }),
        }
      }
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: state.subscription, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

vi.mock('@/lib/paymongo', () => ({
  createPaymentIntent: async (params: { amount?: number; metadata?: Record<string, string> }) => {
    state.intents.push(params)
    return { data: { id: 'pi_1' } }
  },
  createPaymentMethodQrph: async () => ({ data: { id: 'pm_1' } }),
  attachPaymentMethodToIntent: async () => ({
    data: { attributes: { next_action: { code: { image_url: 'https://qr.example/img' } } } },
  }),
  retrievePaymentIntent: async () => ({
    data: { attributes: { metadata: { user_id: 'user-1' }, status: 'awaiting_payment_method' } },
  }),
  PayMongoError: class PayMongoError extends Error {
    status = 400
    body = null
  },
  PAYMONGO_MIN_AMOUNT_CENTAVOS: 2000,
  paymongoBelowMinimumMessage: () => 'below minimum',
}))

import { POST } from './route'

const post = (body: unknown = {}) =>
  POST(
    new Request('http://localhost/api/paymongo/create-qrph', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.user = { id: 'user-1', email: 'juan@example.com', user_metadata: {} }
  state.profile = { user_type: 'user' }
  state.subscription = null
  state.intents = []
})

describe('POST /api/paymongo/create-qrph', () => {
  it('charges the server price of ₱999 and ignores the client body', async () => {
    const res = await post({ plan_type: 'monthly', amount: 100, promoCode: 'FNDRUSER1299' })
    expect(res.status).toBe(200)
    expect(state.intents).toHaveLength(1)
    expect(state.intents[0].amount).toBe(99_900)
    expect(state.intents[0].metadata).toMatchObject({
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    })
    expect(state.intents[0].metadata).not.toHaveProperty('promoCode')
  })

  it('charges a tester ₱5', async () => {
    state.profile = { user_type: 'tester' }
    const res = await post({ plan_type: 'annual', amount: 99_900 })
    expect(res.status).toBe(200)
    expect(state.intents[0].amount).toBe(500)
    expect(state.intents[0].metadata?.expected_amount_centavos).toBe('500')
    expect(state.intents[0].metadata?.grant).toBe('lifetime')
  })

  it('lets an active monthly or annual row buy', async () => {
    state.subscription = {
      status: 'active',
      plan_id: 'plan-pro',
      current_period_end: '2027-01-01T00:00:00.000Z',
      is_lifetime: false,
    }
    expect((await post()).status).toBe(200)
    expect(state.intents[0].amount).toBe(99_900)
  })

  it('blocks a repurchase when the row is already lifetime', async () => {
    state.subscription = {
      status: 'expired',
      plan_id: 'plan-pro',
      current_period_end: '2020-01-01T00:00:00.000Z',
      is_lifetime: true,
    }
    const res = await post()
    expect(res.status).toBe(400)
    expect(state.intents).toHaveLength(0)
  })

  it('requires a signed-in user', async () => {
    state.user = null
    expect((await post()).status).toBe(401)
    expect(state.intents).toHaveLength(0)
  })
})
