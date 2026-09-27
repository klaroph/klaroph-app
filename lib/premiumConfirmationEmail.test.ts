import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  insertError: null as { code: string } | null,
  subscription: null as Record<string, unknown> | null,
  payload: null as unknown,
  inserts: [] as unknown[],
  sendTransactionalEmail: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => {
  const read = (data: unknown) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data }) }
    return q
  }
  return {
    supabaseAdmin: {
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'juan@example.com' } } }) } },
      from: (table: string) => {
        if (table === 'premium_confirmation_emails') {
          return {
            insert: async (row: unknown) => {
              state.inserts.push(row)
              return { error: state.insertError }
            },
          }
        }
        if (table === 'profiles') return read({ nickname: 'Juan', full_name: 'Juan Dela Cruz' })
        if (table === 'subscriptions') return read(state.subscription)
        if (table === 'payment_events') return read({ payload: state.payload })
        throw new Error(`unexpected table ${table}`)
      },
    },
  }
})

vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/resend')>()),
  sendTransactionalEmail: state.sendTransactionalEmail,
}))

import { sendPremiumConfirmationIfNew } from './premiumConfirmationEmail'

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  state.insertError = null
  state.subscription = { current_period_end: '2026-10-26T04:00:00.000Z', is_lifetime: false }
  state.payload = { data: { attributes: { data: { attributes: { amount: 143_040, currency: 'PHP' } } } } }
  state.inserts = []
  state.sendTransactionalEmail.mockReset().mockResolvedValue({ ok: true, id: 're_1' })
})

describe('sendPremiumConfirmationIfNew', () => {
  it('emails the real plan facts once per webhook event', async () => {
    await sendPremiumConfirmationIfNew('evt_1', 'user-1', 'monthly')
    expect(state.inserts).toEqual([{ event_id: 'evt_1', user_id: 'user-1' }])
    const [, message, key] = state.sendTransactionalEmail.mock.calls[0]
    expect(message.to).toBe('juan@example.com')
    expect(message.subject).toBe('You’re officially KlaroPH Pro')
    expect(message.text).toContain('Hi Juan,')
    expect(message.text).toContain('Plan: KlaroPH Pro · Monthly')
    expect(message.text).toContain('Amount paid: ₱1,430.40')
    expect(message.text).toContain('Active until: October 26, 2026')
    expect(message.text).not.toMatch(/sample email/i)
    expect(key).toBe('premium-confirmation-evt_1')
  })

  it('reflects a founder lifetime purchase', async () => {
    state.subscription = { current_period_end: '2026-10-26T04:00:00.000Z', is_lifetime: true }
    await sendPremiumConfirmationIfNew('evt_2', 'user-1', 'annual')
    const { text } = state.sendTransactionalEmail.mock.calls[0][1]
    expect(text).toContain('Plan: KlaroPH Pro · Lifetime')
    expect(text).not.toMatch(/Active until|renew/i)
  })

  it('omits the amount when the stored payment has none', async () => {
    state.payload = null
    await sendPremiumConfirmationIfNew('evt_3', 'user-1', 'monthly')
    expect(state.sendTransactionalEmail.mock.calls[0][1].text).not.toContain('Amount paid')
  })

  it('skips an already-emailed event', async () => {
    state.insertError = { code: '23505' }
    await sendPremiumConfirmationIfNew('evt_1', 'user-1', 'monthly')
    expect(state.sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('never throws into the webhook', async () => {
    state.sendTransactionalEmail.mockRejectedValue(new Error('network'))
    await expect(sendPremiumConfirmationIfNew('evt_4', 'user-1', 'monthly')).resolves.toBeUndefined()
  })
})
