import { describe, expect, it } from 'vitest'
import {
  formatManilaDateTime,
  renderFounderReportEmail,
  renderPaymentFailedEmail,
  renderPaymentReceivedEmail,
  renderSupportAlertEmail,
} from './founderEmails'
import { buildFounderReport, manilaReportWindow, type FounderReport } from '@/lib/founder/report'

const NOW = new Date('2026-09-27T02:00:00.000Z')
const URL = 'https://klaroph.com/admin/founder'

function report(over: Partial<FounderReport> = {}): FounderReport {
  const window = manilaReportWindow(NOW)
  return {
    window,
    shortLabel: 'Sep 26',
    longLabel: 'Saturday, September 26, 2026',
    yesterday: { newUsers: 3, newUsersPreviousDay: 1, payments: { count: 2, gross: 398 }, failedPayments: 1, newSupportRequests: 1 },
    current: { active: 42, dormant: 17, pro: 9 },
    support: { open: 2, awaitingReply: 1, oldestWaitingDays: 2, needsAction: [{ who: 'Maria Santos', title: 'Payment issue', waitingDays: 2 }] },
    health: [],
    quiet: false,
    ...over,
  }
}

describe('renderFounderReportEmail', () => {
  it('states the reporting date and labels current snapshot numbers apart from yesterday', () => {
    const email = renderFounderReportEmail(report(), { missionControlUrl: URL })
    expect(email.subject).toBe('KlaroPH Founder Report — Sep 26')
    expect(email.text).toContain('FOUNDER REPORT\nGood morning, Founder')
    expect(email.text).toContain('Saturday, September 26, 2026 (Manila time)')
    expect(email.text).toContain('New users · yesterday: 3 (+2 vs previous day)')
    expect(email.text).toContain('Active users · current: 42')
    expect(email.text).toContain('Pro users · current: 9')
    expect(email.text).toContain('Dormant users · current: 17')
  })

  it('renders revenue, failures and the needs-action list', () => {
    const email = renderFounderReportEmail(report(), { missionControlUrl: URL })
    expect(email.text).toContain('Payments received: 2')
    expect(email.text).toContain('Revenue: ₱398.00')
    expect(email.text).toContain('Failed payments: 1')
    expect(email.text).toContain('Maria Santos — Payment issue — waiting 2 days')
    expect(email.text).toContain('Open customer requests · current: 2')
  })

  it('uses plain empty states instead of zero rows', () => {
    const email = renderFounderReportEmail(
      report({
        yesterday: { newUsers: 0, newUsersPreviousDay: 0, payments: { count: 0, gross: 0 }, failedPayments: 0, newSupportRequests: 0 },
        support: { open: 0, awaitingReply: 0, oldestWaitingDays: null, needsAction: [] },
        quiet: true,
      }),
      { missionControlUrl: URL }
    )
    expect(email.text).toContain('No payments received.')
    expect(email.text).toContain('No failed payments.')
    expect(email.text).toContain('No customer support requests need your attention.')
    expect(email.text).toContain('Quiet day. No new revenue, no customer support requests and no major product issues.')
    expect(email.text).toContain('No action needed.')
    expect(email.text).not.toContain('Revenue: ₱0.00')
  })

  it('says a source was unavailable rather than inventing zeros', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: { users: [], revenue: { recent: [], failures: [] }, database: { ok: true }, attention: [], unavailable: ['Payments'] },
      support: null,
    })
    const email = renderFounderReportEmail(r, { missionControlUrl: URL })
    expect(email.text).toContain('Payment data could not be loaded for this report.')
    expect(email.text).toContain('Support requests could not be loaded for this report.')
    expect(email.text).not.toContain('No payments received.')
  })

  it('links to Mission Control and labels test sends', () => {
    const live = renderFounderReportEmail(report(), { missionControlUrl: URL })
    expect(live.html).toContain(`href="${URL}"`)
    expect(live.text).toContain(`Open Mission Control →: ${URL}`)
    const test = renderFounderReportEmail(report(), { missionControlUrl: URL, testMode: true })
    expect(test.subject).toBe('[TEST] KlaroPH Founder Report — Sep 26')
  })
})

describe('founder alerts', () => {
  it('support alert shows requester, email, subject, message and Manila time', () => {
    const email = renderSupportAlertEmail({
      requester: 'Maria Santos',
      email: 'maria@example.com',
      subject: 'Payment issue',
      message: 'Paid but still <b>Free</b>',
      receivedAt: '2026-09-27T07:04:00.000Z',
      supportUrl: 'https://klaroph.com/admin/founder/support',
    })
    expect(email.subject).toBe('KlaroPH — New support request')
    expect(email.text).toContain('Requester: Maria Santos')
    expect(email.text).toContain('Email: maria@example.com')
    expect(email.text).toContain('Subject: Payment issue')
    expect(email.text).toContain('Received: Sep 27, 2026, 3:04 PM (Manila)')
    expect(email.html).toContain('Paid but still &lt;b&gt;Free&lt;/b&gt;')
    expect(email.html).toContain('Open Support Inbox →')
  })

  it('payment received shows customer, plan, amount and confirmation', () => {
    const email = renderPaymentReceivedEmail({
      customer: 'Juan dela Cruz',
      email: 'juan@example.com',
      planLabel: 'Annual',
      amount: { centavos: 199_900, currency: 'PHP' },
      occurredAt: '2026-09-27T02:00:00.000Z',
      revenueUrl: 'https://klaroph.com/admin/founder/revenue',
    })
    expect(email.subject).toBe('💰 KlaroPH — Payment received · ₱1,999.00')
    expect(email.text).toContain('Customer: Juan dela Cruz')
    expect(email.text).toContain('Plan: Annual')
    expect(email.text).toContain('Amount: ₱1,999.00')
    expect(email.text).toContain('Payment: Confirmed by PayMongo')
    expect(email.html).toContain('Open Revenue →')
  })

  it('payment failed shows the safe reason and omits unknown plan and amount', () => {
    const email = renderPaymentFailedEmail({
      customer: null,
      email: null,
      planLabel: null,
      amount: null,
      reason: 'Card declined',
      occurredAt: '2026-09-27T02:00:00.000Z',
      revenueUrl: 'https://klaroph.com/admin/founder/revenue',
    })
    expect(email.subject).toBe('KlaroPH — Payment failed')
    expect(email.text).toContain('Customer: Unknown customer')
    expect(email.text).toContain('Reason: Card declined')
    expect(email.text).not.toContain('Plan:')
    expect(email.text).not.toContain('Amount:')
  })

  it('formats times in Manila regardless of the server time zone', () => {
    expect(formatManilaDateTime('2026-09-26T16:30:00.000Z')).toBe('Sep 27, 2026, 12:30 AM (Manila)')
    expect(formatManilaDateTime('not a date')).toBe('Unknown time')
  })
})
