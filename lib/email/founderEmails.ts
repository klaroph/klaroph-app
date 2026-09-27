/**
 * Private founder notifications: the daily Founder Report and real-time support/payment alerts.
 * Pure renderers over facts the caller already verified; a missing fact is omitted, never guessed.
 * Transactional to the founder only — never marketing, never sent to customers.
 */

import { renderOperationalEmail, type EmailDetailRow, type OperationalSection } from '@/lib/email/transactionalLayout'
import { formatPaidAmount, type PaidAmount, type RenderedEmail } from '@/lib/email/proEmails'
import { formatCount, formatPeso } from '@/lib/founder/format'
import type { FounderReport } from '@/lib/founder/report'

const TEST_SUBJECT_PREFIX = '[TEST] '
const ALERT_FOOTER = 'Private KlaroPH founder alert, sent to the configured founder address.'

const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`
const withTest = (subject: string, testMode?: boolean) => (testMode ? `${TEST_SUBJECT_PREFIX}${subject}` : subject)

/** Manila date and time, e.g. "Sep 27, 2026, 3:04 PM (Manila)". */
export function formatManilaDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown time'
  const text = d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${text} (Manila)`
}

// ---------------------------------------------------------------- Daily report

function summaryItems(r: FounderReport): string[] {
  const items: string[] = []
  const y = r.yesterday
  if (y.newUsers) items.push(plural(y.newUsers, 'new user'))
  if (y.payments?.count) items.push(`${formatPeso(y.payments.gross)} revenue from ${plural(y.payments.count, 'payment')}`)
  if (y.failedPayments) items.push(plural(y.failedPayments, 'failed payment'))
  if (r.support?.awaitingReply) {
    items.push(`${plural(r.support.awaitingReply, 'customer support request')} ${r.support.awaitingReply === 1 ? 'needs' : 'need'} attention`)
  }
  if (r.health.length) items.push(plural(r.health.length, 'product issue'))
  return items
}

function change(today: number, before: number | null): string {
  if (before === null) return ''
  const diff = today - before
  if (diff === 0) return ' (same as previous day)'
  return ` (${diff > 0 ? '+' : '−'}${formatCount(Math.abs(diff))} vs previous day)`
}

const valueOr = (n: number | null) => (n === null ? 'Unavailable' : formatCount(n))

export function renderFounderReportEmail(
  report: FounderReport,
  options: { missionControlUrl: string; testMode?: boolean }
): RenderedEmail {
  const y = report.yesterday
  const summary = summaryItems(report)

  const activityRows: EmailDetailRow[] = [
    {
      label: 'New users · yesterday',
      value: y.newUsers === null ? 'Unavailable' : `${formatCount(y.newUsers)}${change(y.newUsers, y.newUsersPreviousDay)}`,
    },
    { label: 'Active users · current', value: valueOr(report.current.active) },
    { label: 'Pro users · current', value: valueOr(report.current.pro) },
    { label: 'Dormant users · current', value: valueOr(report.current.dormant) },
  ]

  const revenue: OperationalSection = { title: `Revenue · ${report.shortLabel}` }
  if (!y.payments || y.failedPayments === null) {
    revenue.body = 'Payment data could not be loaded for this report. Check Revenue in Mission Control.'
  } else {
    revenue.rows = y.payments.count
      ? [
          { label: 'Payments received', value: formatCount(y.payments.count) },
          { label: 'Revenue', value: formatPeso(y.payments.gross) },
        ]
      : []
    if (y.failedPayments) revenue.rows.push({ label: 'Failed payments', value: formatCount(y.failedPayments) })
    revenue.items = [
      ...(y.payments.count ? [] : ['No payments received.']),
      ...(y.failedPayments ? [] : ['No failed payments.']),
    ]
  }

  const support: OperationalSection = { title: 'Support' }
  if (!report.support) {
    support.body = 'Support requests could not be loaded for this report. Check the Support Inbox.'
  } else {
    support.rows = [
      { label: 'Open customer requests · current', value: formatCount(report.support.open) },
      { label: 'New requests · yesterday', value: valueOr(y.newSupportRequests) },
      ...(report.support.oldestWaitingDays !== null
        ? [{ label: 'Oldest waiting', value: plural(report.support.oldestWaitingDays, 'day') }]
        : []),
    ]
    if (report.support.needsAction.length) {
      const more = report.support.awaitingReply - report.support.needsAction.length
      support.items = report.support.needsAction.map((n) => `${n.who} — ${n.title} — waiting ${plural(n.waitingDays, 'day')}`)
      support.note = more > 0 ? `Needs action · ${plural(more, 'more request')} in the Support Inbox.` : 'Needs action: reply from the Support Inbox.'
    } else {
      support.note = 'No customer support requests need your attention.'
    }
  }

  const { html, text } = renderOperationalEmail({
    preheader: report.quiet ? 'Quiet day. No action needed.' : summary.join(' · '),
    label: 'Founder Report',
    headline: 'Good morning, Founder',
    tone: 'attention',
    intro: [`Here’s ${report.longLabel} (Manila time) at a glance.`],
    sections: [
      report.quiet
        ? { title: 'Yesterday', body: 'Quiet day. No new revenue, no customer support requests and no major product issues.\nNo action needed.' }
        : { title: 'Yesterday', items: summary.length ? summary : ['No new users, payments or support requests.'] },
      {
        title: 'Activity',
        rows: activityRows,
        note: 'Current = at the time of this report. Active = signed in within the last 30 days. Tester accounts are excluded.',
      },
      revenue,
      support,
      report.health.length ? { title: 'Product health', items: report.health } : { title: 'Product health', body: 'No action needed.' },
    ],
    cta: { label: 'Open Mission Control →', url: options.missionControlUrl },
    footerReason: 'Private KlaroPH founder report, sent daily at 10:00 AM Manila time.',
    testNotice: options.testMode ? 'This is a KlaroPH sample founder report built from example data.' : undefined,
  })

  return { subject: withTest(`KlaroPH Founder Report — ${report.shortLabel}`, options.testMode), html, text }
}

// ---------------------------------------------------------------- Support alert

export type SupportAlertEmailInput = {
  requester: string | null
  email: string | null
  subject: string | null
  message: string
  receivedAt: string
  supportUrl: string
  testMode?: boolean
}

export function renderSupportAlertEmail(input: SupportAlertEmailInput): RenderedEmail {
  const who = input.requester ?? input.email ?? 'A customer'
  const { html, text } = renderOperationalEmail({
    preheader: `${who}${input.subject ? `: ${input.subject}` : ' sent a support request.'}`,
    label: 'New support request',
    headline: `${who} needs a hand`,
    tone: 'attention',
    sections: [
      {
        title: 'Request',
        rows: [
          { label: 'Requester', value: input.requester ?? 'No name on profile' },
          { label: 'Email', value: input.email ?? 'Not provided' },
          { label: 'Subject', value: input.subject ?? 'No subject' },
          { label: 'Received', value: formatManilaDateTime(input.receivedAt) },
        ],
      },
      { title: 'Message', body: input.message },
    ],
    cta: { label: 'Open Support Inbox →', url: input.supportUrl },
    footerReason: ALERT_FOOTER,
    testNotice: input.testMode ? 'This is a KlaroPH sample alert. No support request was created.' : undefined,
  })
  return { subject: withTest('KlaroPH — New support request', input.testMode), html, text }
}

// ---------------------------------------------------------------- Payment alerts

export type PaymentAlertEmailInput = {
  customer: string | null
  email: string | null
  planLabel: string | null
  amount: PaidAmount | null
  occurredAt: string
  revenueUrl: string
  testMode?: boolean
}

function customerRows(input: PaymentAlertEmailInput): EmailDetailRow[] {
  return [
    { label: 'Customer', value: input.customer ?? input.email ?? 'Unknown customer' },
    ...(input.customer && input.email ? [{ label: 'Email', value: input.email }] : []),
    ...(input.planLabel ? [{ label: 'Plan', value: input.planLabel }] : []),
  ]
}

export function renderPaymentReceivedEmail(input: PaymentAlertEmailInput): RenderedEmail {
  const amount = formatPaidAmount(input.amount)
  const { html, text } = renderOperationalEmail({
    preheader: `${amount ?? 'A payment'} from ${input.customer ?? input.email ?? 'a customer'}.`,
    label: 'Payment received',
    headline: amount ? `${amount} received` : 'Payment received',
    tone: 'positive',
    sections: [
      {
        title: 'Payment',
        rows: [
          ...customerRows(input),
          ...(amount ? [{ label: 'Amount', value: amount }] : []),
          { label: 'Payment', value: 'Confirmed by PayMongo' },
          { label: 'Received', value: formatManilaDateTime(input.occurredAt) },
        ],
      },
    ],
    cta: { label: 'Open Revenue →', url: input.revenueUrl },
    footerReason: ALERT_FOOTER,
    testNotice: input.testMode ? 'This is a KlaroPH sample alert. No payment was made and no subscription was changed.' : undefined,
  })
  return { subject: withTest(`💰 KlaroPH — Payment received${amount ? ` · ${amount}` : ''}`, input.testMode), html, text }
}

export function renderPaymentFailedEmail(input: PaymentAlertEmailInput & { reason: string | null }): RenderedEmail {
  const amount = formatPaidAmount(input.amount)
  const { html, text } = renderOperationalEmail({
    preheader: `A payment${amount ? ` of ${amount}` : ''} from ${input.customer ?? input.email ?? 'a customer'} failed.`,
    label: 'Payment failed',
    headline: 'A payment didn’t go through',
    tone: 'warning',
    sections: [
      {
        title: 'Payment',
        rows: [
          ...customerRows(input),
          ...(amount ? [{ label: 'Amount', value: amount }] : []),
          { label: 'Status', value: 'Failed (PayMongo payment.failed)' },
          ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
          { label: 'When', value: formatManilaDateTime(input.occurredAt) },
        ],
        note: 'No Pro access was granted for this payment. The customer may retry from KlaroPH.',
      },
    ],
    cta: { label: 'Open Revenue →', url: input.revenueUrl },
    footerReason: ALERT_FOOTER,
    testNotice: input.testMode ? 'This is a KlaroPH sample alert. No payment was attempted.' : undefined,
  })
  return { subject: withTest('KlaroPH — Payment failed', input.testMode), html, text }
}
