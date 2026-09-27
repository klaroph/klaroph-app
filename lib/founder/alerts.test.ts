import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  founderDockUrl,
  founderRecipient,
  safeFailureReason,
  sendDailyFounderReport,
  sendPaymentAlert,
  sendSupportAlert,
  type AccountLookup,
  type PaymentAlertInput,
} from './alerts'
import type { ReportSnapshot } from './report'

const FOUNDER = 'founder@example.com'
const NOW = new Date('2026-09-27T02:00:00.000Z')

type Sent = { to: string; subject: string; html: string; text: string }

type SendResult = { ok: true; id: string } | { ok: false; error: string }

function mailer(result: SendResult = { ok: true, id: 're_1' }) {
  return vi.fn<(message: Sent, key: string) => Promise<SendResult>>(async () => result)
}

const realAccount: AccountLookup = async () => ({ name: 'Juan dela Cruz', email: 'juan@example.com', isTester: false })
const testerAccount: AccountLookup = async () => ({ name: 'QA', email: 'qa@example.com', isTester: true })

const PROD_ENV = { NEXT_PUBLIC_APP_URL: 'https://klaroph.com' }

describe('founderRecipient', () => {
  it('reads FOUNDER_EMAIL from server config only and validates it', () => {
    expect(founderRecipient({ FOUNDER_EMAIL: ' Founder@Example.com ' })).toBe(FOUNDER)
    expect(founderRecipient({})).toBeNull()
    expect(founderRecipient({ FOUNDER_EMAIL: 'not-an-email' })).toBeNull()
  })
})

describe('founderDockUrl', () => {
  it('uses the production app URL and never a local dev server', () => {
    expect(founderDockUrl('/admin/founder', { NEXT_PUBLIC_APP_URL: 'https://klaroph.com/' })).toBe('https://klaroph.com/admin/founder')
    expect(founderDockUrl('/admin/founder', { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBe('https://klaroph.com/admin/founder')
    expect(founderDockUrl('/admin/founder', { NEXT_PUBLIC_APP_URL: 'https://127.0.0.1:3000' })).toBe('https://klaroph.com/admin/founder')
    expect(founderDockUrl('/admin/founder', {})).toBe('https://klaroph.com/admin/founder')
  })
})

// ---------------------------------------------------------------- Support

const SUPPORT = {
  requestId: 'req-1',
  userId: 'user-1',
  email: 'maria@example.com',
  subject: 'Payment issue',
  message: 'Paid but still Free',
  createdAt: '2026-09-27T07:04:00.000Z',
}

describe('sendSupportAlert', () => {
  it('emails the founder about a real customer request, keyed by the support request id', async () => {
    const send = mailer()
    const outcome = await sendSupportAlert({ recipient: FOUNDER, send, lookupAccount: realAccount, env: PROD_ENV }, SUPPORT)
    expect(outcome).toEqual({ status: 'sent', id: 're_1' })
    const [message, key] = send.mock.calls[0]
    expect(message.to).toBe(FOUNDER)
    expect(message.text).toContain('Requester: Juan dela Cruz')
    expect(message.text).toContain('Email: maria@example.com')
    expect(message.html).toContain('https://klaroph.com/admin/founder/support')
    expect(key).toBe('founder-support-alert-req-1')
  })

  it('does not alert for tester requests', async () => {
    const send = mailer()
    expect(await sendSupportAlert({ recipient: FOUNDER, send, lookupAccount: testerAccount }, SUPPORT)).toEqual({
      status: 'skipped',
      reason: 'Tester support request.',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('a repeated alert for the same request reuses the same idempotency key', async () => {
    const send = mailer()
    const deps = { recipient: FOUNDER, send, lookupAccount: realAccount }
    await sendSupportAlert(deps, SUPPORT)
    await sendSupportAlert(deps, SUPPORT)
    expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1])
  })

  it('skips without a configured founder recipient or delivery', async () => {
    const send = mailer()
    expect((await sendSupportAlert({ recipient: null, send, lookupAccount: realAccount }, SUPPORT)).status).toBe('skipped')
    expect((await sendSupportAlert({ recipient: FOUNDER, send: null, lookupAccount: realAccount }, SUPPORT)).status).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('never throws: lookup and Resend failures become a failed outcome', async () => {
    const broken: AccountLookup = async () => {
      throw new Error('Profile lookup failed.')
    }
    expect(await sendSupportAlert({ recipient: FOUNDER, send: mailer(), lookupAccount: broken }, SUPPORT)).toEqual({
      status: 'failed',
      error: 'Profile lookup failed.',
    })
    expect(
      await sendSupportAlert({ recipient: FOUNDER, send: mailer({ ok: false, error: 'rate limited' }), lookupAccount: realAccount }, SUPPORT)
    ).toEqual({ status: 'failed', error: 'rate limited' })
  })
})

// ---------------------------------------------------------------- Payments

const PAID: PaymentAlertInput = {
  kind: 'paid',
  eventId: 'evt_paid',
  livemode: true,
  userId: 'user-1',
  planLabel: 'Monthly',
  amount: { centavos: 19_900, currency: 'PHP' },
  reason: null,
  occurredAt: '2026-09-27T02:00:00.000Z',
}
const FAILED: PaymentAlertInput = { ...PAID, kind: 'failed', eventId: 'evt_failed', reason: 'Card declined' }

describe('sendPaymentAlert', () => {
  it('emails a confirmed live payment with canonical event data, keyed by the PayMongo event id', async () => {
    const send = mailer()
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: realAccount, env: PROD_ENV }, PAID)).status).toBe('sent')
    const [message, key] = send.mock.calls[0]
    expect(message.to).toBe(FOUNDER)
    expect(message.subject).toContain('Payment received · ₱199.00')
    expect(message.text).toContain('Customer: Juan dela Cruz')
    expect(message.text).toContain('Plan: Monthly')
    expect(message.text).toContain('Amount: ₱199.00')
    expect(message.html).toContain('https://klaroph.com/admin/founder/revenue')
    expect(key).toBe('founder-payment-paid-evt_paid')
  })

  it('emails a failed live payment with a safe reason', async () => {
    const send = mailer()
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: realAccount }, FAILED)).status).toBe('sent')
    const [message, key] = send.mock.calls[0]
    expect(message.subject).toBe('KlaroPH — Payment failed')
    expect(message.text).toContain('Reason: Card declined')
    expect(key).toBe('founder-payment-failed-evt_failed')
  })

  it('alerts a failure from an unknown payer, like the dock counts it', async () => {
    const send = mailer()
    const lookupAccount = vi.fn(realAccount)
    await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount }, { ...FAILED, userId: null })
    expect(lookupAccount).not.toHaveBeenCalled()
    expect(send.mock.calls[0][0].text).toContain('Customer: Unknown customer')
  })

  it('excludes testers, test-mode events and paid events without an account', async () => {
    const send = mailer()
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: testerAccount }, PAID)).status).toBe('skipped')
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: testerAccount }, FAILED)).status).toBe('skipped')
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: realAccount }, { ...PAID, livemode: false })).status).toBe('skipped')
    expect((await sendPaymentAlert({ recipient: FOUNDER, send, lookupAccount: realAccount }, { ...PAID, userId: null })).status).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
  })

  it('a redelivered event reuses the same idempotency key', async () => {
    const send = mailer()
    const deps = { recipient: FOUNDER, send, lookupAccount: realAccount }
    await sendPaymentAlert(deps, PAID)
    await sendPaymentAlert(deps, PAID)
    expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1])
  })

  it('never throws when Resend fails or rejects', async () => {
    const rejecting = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(sendPaymentAlert({ recipient: FOUNDER, send: rejecting, lookupAccount: realAccount }, PAID)).resolves.toEqual({
      status: 'failed',
      error: 'network down',
    })
  })

  it('trims failure reasons to a short single line', () => {
    expect(safeFailureReason('  Card\n declined  ')).toBe('Card declined')
    expect(safeFailureReason('x'.repeat(500))).toHaveLength(160)
    expect(safeFailureReason({ secret: 'payload' })).toBeNull()
    expect(safeFailureReason('')).toBeNull()
  })
})

// ---------------------------------------------------------------- Daily report

const SNAPSHOT: ReportSnapshot = { users: [], revenue: { recent: [], failures: [] }, database: { ok: true }, attention: [], unavailable: [] }

describe('sendDailyFounderReport', () => {
  it('sends the previous Manila day report to the founder recipient', async () => {
    const send = mailer()
    const outcome = await sendDailyFounderReport({
      recipient: FOUNDER,
      send,
      now: NOW,
      load: async () => ({ snapshot: SNAPSHOT, support: [] }),
      env: PROD_ENV,
    })
    expect(outcome).toEqual({ status: 'sent', id: 're_1', reportDate: '2026-09-26' })
    const [message, key] = send.mock.calls[0]
    expect(message.to).toBe(FOUNDER)
    expect(message.subject).toBe('KlaroPH Founder Report — Sep 26')
    expect(message.text).toContain('Quiet day.')
    expect(message.html).toContain('https://klaroph.com/admin/founder')
    expect(key).toMatch(/^founder-daily-report-2026-09-26-[0-9a-f]{12}$/)
  })

  it('is idempotent per reporting date and recipient', async () => {
    const send = mailer()
    const deps = { recipient: FOUNDER, send, load: async () => ({ snapshot: SNAPSHOT, support: [] }) }
    await sendDailyFounderReport({ ...deps, now: NOW })
    await sendDailyFounderReport({ ...deps, now: new Date('2026-09-27T09:00:00.000Z') }) // same Manila day, later re-run
    await sendDailyFounderReport({ ...deps, now: new Date('2026-09-28T02:00:00.000Z') })
    await sendDailyFounderReport({ ...deps, recipient: 'other@example.com', now: NOW })
    const keys = send.mock.calls.map((c) => c[1])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    expect(keys[3]).not.toBe(keys[0])
    expect(keys.join()).not.toContain('founder@example.com')
  })

  it('does not load or send without a founder recipient, and never throws on load failure', async () => {
    const load = vi.fn(async () => ({ snapshot: SNAPSHOT, support: [] }))
    expect((await sendDailyFounderReport({ recipient: null, send: mailer(), now: NOW, load })).status).toBe('skipped')
    expect(load).not.toHaveBeenCalled()

    const failing = async () => {
      throw new Error('snapshot failed')
    }
    expect(await sendDailyFounderReport({ recipient: FOUNDER, send: mailer(), now: NOW, load: failing })).toEqual({
      status: 'failed',
      error: 'snapshot failed',
      reportDate: '2026-09-26',
    })
  })
})

// ---------------------------------------------------------------- Security

describe('founder notification security', () => {
  const root = path.join(__dirname, '..', '..')
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
  const files = [
    'lib/founder/alerts.ts',
    'lib/founder/alertsServer.ts',
    'lib/founder/report.ts',
    'lib/email/founderEmails.ts',
    'app/api/cron/founder-report/route.ts',
    'app/api/support/route.ts',
    'app/api/paymongo/webhook/route.ts',
  ]

  it('never touches marketing sends, unsubscribe tokens or campaign tags', () => {
    for (const file of files) expect(read(file)).not.toMatch(/marketing_email_sends|unsubscribe|campaign/i)
  })

  it('reads the Resend key only through the server-side config helper and never logs it', () => {
    for (const file of files) expect(read(file)).not.toMatch(/RESEND_API_KEY|NEXT_PUBLIC_RESEND|apiKey/)
    for (const file of files.slice(0, 5)) {
      expect(read(file)).not.toMatch(/console\.\w+\([^)]*(recipient|FOUNDER_EMAIL|payload|message\.)/)
    }
  })

  it('takes the founder recipient from server config, not from any request', () => {
    expect(read('lib/founder/alertsServer.ts')).toContain('recipient: founderRecipient()')
    for (const file of ['app/api/support/route.ts', 'app/api/paymongo/webhook/route.ts', 'app/api/cron/founder-report/route.ts']) {
      expect(read(file)).not.toMatch(/FOUNDER_EMAIL|recipient/)
    }
  })

  it('schedules the report at 10:00 Manila (02:00 UTC) through Vercel Cron', () => {
    const config = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    expect(config.crons).toContainEqual({ path: '/api/cron/founder-report', schedule: '0 2 * * *' })
  })
})
