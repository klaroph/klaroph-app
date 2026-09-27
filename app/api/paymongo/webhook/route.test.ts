import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  claimed: new Set<string>(),
  upserts: [] as Record<string, unknown>[],
  intentMetadata: {} as Record<string, string>,
  notify: vi.fn<(input: Record<string, unknown>) => Promise<void>>(async () => {}),
  premium: vi.fn(async () => {}),
}))

vi.mock('@/lib/paymongoWebhookSecurity', () => ({ authorizePaymongoWebhook: () => ({ ok: true, timestamp: 0 }) }))
vi.mock('@/lib/paymongo', () => ({
  retrieveCheckoutSession: vi.fn(),
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
          upsert: async (row: Record<string, unknown>) => {
            state.upserts.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import { FOUNDER_PROMO_CODE } from '@/lib/checkoutPromo'
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

const deliver = (event: unknown) =>
  POST(new Request('http://localhost/api/paymongo/webhook', { method: 'POST', body: JSON.stringify(event), headers: { 'paymongo-signature': 'sig' } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  state.claimed.clear()
  state.upserts = []
  state.intentMetadata = { user_id: 'user-1', plan: 'pro', plan_type: 'annual' }
  state.notify.mockResolvedValue(undefined)
})

describe('PayMongo webhook founder payment alerts', () => {
  it('alerts once per confirmed payment, from the canonical event and intent data, after fulfillment', async () => {
    const event = paymentEvent('payment.paid', { id: 'evt_paid' })
    expect((await deliver(event)).status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.notify).toHaveBeenCalledWith({
      kind: 'paid',
      eventId: 'evt_paid',
      livemode: true,
      userId: 'user-1',
      planLabel: 'Annual',
      amount: { centavos: 19_900, currency: 'PHP' },
      reason: null,
      occurredAt: '2026-09-27T02:00:00.000Z',
    })
  })

  it('labels founder-promo purchases as Lifetime', async () => {
    state.intentMetadata = { user_id: 'user-1', plan: 'pro', plan_type: 'monthly', promo_code: FOUNDER_PROMO_CODE }
    await deliver(paymentEvent('payment.paid'))
    expect(state.notify.mock.calls[0][0]).toMatchObject({ planLabel: 'Lifetime' })
  })

  it('a duplicate webhook delivery does not alert again', async () => {
    const event = paymentEvent('payment.paid', { id: 'evt_dup' })
    await deliver(event)
    const second = await deliver(event)
    expect(await second.json()).toEqual({ status: 'already_processed' })
    expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.upserts).toHaveLength(1)
  })

  it('payment fulfillment survives a founder alert failure', async () => {
    state.notify.mockRejectedValue(new Error('Resend down'))
    const res = await deliver(paymentEvent('payment.paid'))
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
