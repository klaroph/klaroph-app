import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  claimed: new Set<string>(),
  upserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  existingSubscription: null as { is_lifetime?: boolean } | null,
  intentMetadata: {} as Record<string, string>,
  sessionMetadata: {} as Record<string, string>,
  sessionPayments: [] as { attributes?: Record<string, unknown> }[],
  notify: vi.fn<(input: Record<string, unknown>) => Promise<void>>(async () => {}),
  premium: vi.fn(async () => {}),
}))

vi.mock('@/lib/paymongoWebhookSecurity', () => ({ authorizePaymongoWebhook: () => ({ ok: true, timestamp: 0 }) }))
vi.mock('@/lib/paymongo', () => ({
  retrieveCheckoutSession: async () => ({
    data: { attributes: { metadata: state.sessionMetadata, payments: state.sessionPayments } },
  }),
  retrievePaymentIntent: async () => ({ data: { attributes: { metadata: state.intentMetadata } } }),
}))
vi.mock('@/lib/premiumConfirmationEmail', () => ({ sendPremiumConfirmationIfNew: state.premium }))
vi.mock('@/lib/voucherWebhookIncrement', () => ({ tryIncrementVoucherUsedCountFromMetadata: async () => {} }))
vi.mock('@/lib/founder/alertsServer', () => ({ notifyFounderOfPayment: state.notify }))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'payment_events') {
        return {
          insert: async ({ event_id }: { event_id: string }) => {
            if (state.claimed.has(event_id)) return { error: { code: '23505', message: 'duplicate' } }
            state.claimed.add(event_id)
            return { error: null }
          },
          delete: () => ({ eq: async (_col: string, id: string) => state.claimed.delete(id) }),
        }
      }
      if (table === 'plans') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'plan-pro' } }) }) }) }
      }
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.existingSubscription, error: null }),
            }),
          }),
          upsert: async (row: Record<string, unknown>) => {
            state.upserts.push(row)
            return { error: null }
          },
          update: (row: Record<string, unknown>) => ({
            eq: async () => {
              state.updates.push(row)
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import { POST } from './route'

function paymentEvent(type: 'payment.paid' | 'payment.failed', over: { id?: string; livemode?: boolean; attributes?: Record<string, unknown> } = {}) {
  return {
    data: {
      id: over.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      type: 'event',
      attributes: {
        type,
        livemode: over.livemode ?? true,
        data: {
          id: 'pay_1',
          type: 'payment',
          attributes: { amount: 19_900, currency: 'PHP', payment_intent_id: 'pi_1', ...over.attributes },
        },
        previous_data: {},
        created_at: 1_790_474_400, // 2026-09-27T02:00:00Z
        updated_at: 1_790_474_400,
      },
    },
  }
}

function checkoutPaidEvent(over: { id?: string; attributes?: Record<string, unknown> } = {}) {
  return {
    data: {
      id: over.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: true,
        data: {
          id: 'cs_1',
          type: 'checkout_session',
          attributes: over.attributes ?? {},
        },
        previous_data: {},
        created_at: 1_790_474_400,
        updated_at: 1_790_474_400,
      },
    },
  }
}

function subscriptionEvent(type: string) {
  return {
    data: {
      id: `evt_${type}`,
      type: 'event',
      attributes: {
        type,
        livemode: true,
        data: {
          id: 'sub_1',
          type: 'subscription',
          attributes: { customer_id: 'cus_1', status: 'past_due', resource_id: 'sub_1' },
        },
        previous_data: {},
        created_at: 1_790_474_400,
        updated_at: 1_790_474_400,
      },
    },
  }
}

const deliver = (event: unknown) =>
  POST(new Request('http://localhost/api/paymongo/webhook', { method: 'POST', body: JSON.stringify(event), headers: { 'paymongo-signature': 'sig' } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  state.claimed.clear()
  state.upserts = []
  state.updates = []
  state.existingSubscription = null
  state.intentMetadata = {
    user_id: 'user-1',
    plan: 'pro',
    grant: 'lifetime',
    expected_amount_centavos: '99900',
  }
  state.sessionMetadata = {}
  state.sessionPayments = []
  state.notify.mockResolvedValue(undefined)
})

describe('PayMongo webhook founder payment alerts', () => {
  it('alerts once per confirmed payment, from the canonical event and intent data, after fulfillment', async () => {
    const event = paymentEvent('payment.paid', { id: 'evt_paid', attributes: { amount: 99_900 } })
    expect((await deliver(event)).status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toMatchObject({ is_lifetime: true, auto_renew: false })
    expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.notify).toHaveBeenCalledWith({
      kind: 'paid',
      eventId: 'evt_paid',
      livemode: true,
      userId: 'user-1',
      planLabel: 'Lifetime',
      amount: { centavos: 99_900, currency: 'PHP' },
      reason: null,
      occurredAt: '2026-09-27T02:00:00.000Z',
    })
  })

  it('sets is_lifetime when the paid amount is the server price', async () => {
    await deliver(paymentEvent('payment.paid', { attributes: { amount: 99_900 } }))
    expect(state.upserts[0]).toMatchObject({ is_lifetime: true, auto_renew: false })
    expect(state.notify.mock.calls[0][0]).toMatchObject({ planLabel: 'Lifetime' })
  })

  it('a duplicate webhook delivery does not alert again', async () => {
    const event = paymentEvent('payment.paid', { id: 'evt_dup', attributes: { amount: 99_900 } })
    await deliver(event)
    const second = await deliver(event)
    expect(await second.json()).toEqual({ status: 'already_processed' })
    expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.upserts).toHaveLength(1)
  })

  it('payment fulfillment survives a founder alert failure', async () => {
    state.notify.mockRejectedValue(new Error('Resend down'))
    const res = await deliver(paymentEvent('payment.paid', { attributes: { amount: 99_900 } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(state.upserts).toHaveLength(1)
    expect(state.premium).toHaveBeenCalledTimes(1)
  })

  it('does not alert for payments that are not KlaroPH Pro purchases', async () => {
    state.intentMetadata = {}
    await deliver(paymentEvent('payment.paid'))
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.upserts).toHaveLength(0)
  })

  it('alerts a confirmed payment failure with payment metadata and a safe reason, without changing access', async () => {
    const event = paymentEvent('payment.failed', {
      id: 'evt_failed',
      attributes: {
        metadata: { user_id: 'user-2', plan: 'pro', plan_type: 'monthly' },
        failed_message: 'Card declined',
        failed_code: 'card_declined',
      },
    })
    expect((await deliver(event)).status).toBe(200)
    expect(state.upserts).toHaveLength(0)
    expect(state.notify).toHaveBeenCalledWith({
      kind: 'failed',
      eventId: 'evt_failed',
      livemode: true,
      userId: 'user-2',
      planLabel: 'Monthly',
      amount: { centavos: 19_900, currency: 'PHP' },
      reason: 'Card declined',
      occurredAt: '2026-09-27T02:00:00.000Z',
    })
  })

  it('passes test-mode flags through so the alert layer can exclude them', async () => {
    await deliver(paymentEvent('payment.failed', { livemode: false }))
    expect(state.notify.mock.calls[0][0]).toMatchObject({ livemode: false, userId: null, planLabel: null })
  })

  it('a failed-payment alert error never fails the webhook', async () => {
    state.notify.mockRejectedValue(new Error('Resend down'))
    expect((await deliver(paymentEvent('payment.failed'))).status).toBe(200)
  })

  it('the browser or payload cannot choose the alert recipient', async () => {
    await deliver(paymentEvent('payment.paid', { attributes: { metadata: { recipient: 'attacker@example.com', to: 'attacker@example.com' } } }))
    const input = state.notify.mock.calls[0][0]
    expect(input).not.toHaveProperty('recipient')
    expect(input).not.toHaveProperty('to')
  })
})

describe('PayMongo paid grants', () => {
  it('grants is_lifetime when a checkout session was paid at the server price', async () => {
    state.sessionMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    }
    state.sessionPayments = [{ attributes: { amount: 99_900, currency: 'PHP' } }]
    const res = await deliver(checkoutPaidEvent())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(state.upserts[0]).toMatchObject({ is_lifetime: true, auto_renew: false })
    expect(state.notify).not.toHaveBeenCalled()
  })

  it('does not grant a retired monthly amount, including one that names the old founder code', async () => {
    state.intentMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      plan_type: 'monthly',
      grant: 'monthly',
      expected_amount_centavos: '9900',
      promoCode: 'FNDRUSER1299',
    }
    const res = await deliver(paymentEvent('payment.paid', { attributes: { amount: 9900 } }))
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('grants nothing when grant metadata is missing', async () => {
    state.intentMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      plan_type: 'monthly',
    }
    const res = await deliver(paymentEvent('payment.paid', { id: 'evt_missing_grant', attributes: { amount: 99_900 } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(state.upserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    expect(state.notify).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt_missing_grant', planLabel: null }))
  })

  it('grants nothing when the paid amount does not match the server price', async () => {
    state.intentMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    }
    const paid = await deliver(paymentEvent('payment.paid', { id: 'evt_wrong_amount', attributes: { amount: 9900 } }))
    expect(paid.status).toBe(200)
    expect(state.upserts).toHaveLength(0)

    state.sessionMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    }
    state.sessionPayments = [{ attributes: { amount: 9900, currency: 'PHP' } }]
    const checkout = await deliver(checkoutPaidEvent({ id: 'evt_checkout_wrong' }))
    expect(checkout.status).toBe(200)
    expect(state.upserts).toHaveLength(0)
    expect(state.notify).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt_checkout_wrong', planLabel: null }))
  })

  it('does not rewrite an existing lifetime row when a later matched payment arrives', async () => {
    state.existingSubscription = { is_lifetime: true }
    state.intentMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '99900',
    }
    const res = await deliver(paymentEvent('payment.paid', { attributes: { amount: 99_900 } }))
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    expect(state.notify.mock.calls[0][0]).toMatchObject({ planLabel: 'Lifetime' })
  })

  it('dead subscription and invoice events do not change a lifetime row', async () => {
    state.existingSubscription = { is_lifetime: true }
    const types = [
      'subscription.activated',
      'subscription.updated',
      'subscription.past_due',
      'subscription.unpaid',
      'subscription.invoice.paid',
      'subscription.invoice.payment_failed',
      'invoice.payment_failed',
    ]
    for (const type of types) {
      const res = await deliver(subscriptionEvent(type))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    }
    expect(state.upserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    expect(state.claimed.size).toBe(types.length)
  })

  it('grants a tester payment of ₱5 as is_lifetime', async () => {
    state.intentMetadata = {
      user_id: 'user-1',
      plan: 'pro',
      grant: 'lifetime',
      expected_amount_centavos: '500',
    }
    const res = await deliver(paymentEvent('payment.paid', { attributes: { amount: 500 } }))
    expect(res.status).toBe(200)
    expect(state.upserts[0]).toMatchObject({ is_lifetime: true, auto_renew: false })
    expect(state.notify.mock.calls[0][0]).toMatchObject({ planLabel: 'Lifetime', amount: { centavos: 500, currency: 'PHP' } })
  })

  it('a replayed paid event is still deduped', async () => {
    const event = paymentEvent('payment.paid', { id: 'evt_replay', attributes: { amount: 100 } })
    expect((await deliver(event)).status).toBe(200)
    const second = await deliver(event)
    expect(await second.json()).toEqual({ status: 'already_processed' })
    expect(state.upserts).toHaveLength(0)
    expect(state.notify).toHaveBeenCalledTimes(1)
  })
})
