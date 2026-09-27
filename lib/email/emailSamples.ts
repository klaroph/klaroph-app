/**
 * Founder-only [TEST] samples of KlaroPH account and founder emails, rendered from fixture data
 * and sent to the configured test inbox. Touches no database: no subscription, profile, payment,
 * support request or send log.
 */

import { createHash } from 'crypto'
import { isValidMarketingEmail } from '@/lib/email/marketingAudience'
import { renderComplimentaryProEmail, renderPaidProEmail, type RenderedEmail } from '@/lib/email/proEmails'
import {
  renderFounderReportEmail,
  renderPaymentFailedEmail,
  renderPaymentReceivedEmail,
  renderSupportAlertEmail,
} from '@/lib/email/founderEmails'
import type { SendResult, TransactionalMessage } from '@/lib/email/resend'
import { FOUNDER_PATHS, founderDockUrl } from '@/lib/founder/alerts'
import { formatReportDate, manilaReportWindow, type FounderReport } from '@/lib/founder/report'

export const EMAIL_SAMPLE_KINDS = ['paid', 'complimentary', 'founder-report', 'support-alert', 'payment-received', 'payment-failed'] as const
export type EmailSampleKind = (typeof EMAIL_SAMPLE_KINDS)[number]

export function isEmailSampleKind(value: unknown): value is EmailSampleKind {
  return (EMAIL_SAMPLE_KINDS as readonly unknown[]).includes(value)
}

function monthsFrom(now: Date, months: number): string {
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

function sampleReport(now: Date): FounderReport {
  const window = manilaReportWindow(now)
  return {
    window,
    shortLabel: formatReportDate(window, 'short'),
    longLabel: formatReportDate(window, 'long'),
    yesterday: { newUsers: 3, newUsersPreviousDay: 1, payments: { count: 2, gross: 398 }, failedPayments: 1, newSupportRequests: 1 },
    current: { active: 42, dormant: 17, pro: 9 },
    support: {
      open: 2,
      awaitingReply: 1,
      oldestWaitingDays: 2,
      needsAction: [{ who: 'Maria Santos', title: 'Payment issue', waitingDays: 2 }],
    },
    health: [],
    quiet: false,
  }
}

const SAMPLE_CUSTOMER = { customer: 'Juan dela Cruz', email: 'juan@example.com' }

export function buildEmailSample(kind: EmailSampleKind, now: Date): RenderedEmail {
  const revenueUrl = founderDockUrl(FOUNDER_PATHS.revenue)
  switch (kind) {
    case 'paid':
      return renderPaidProEmail({
        firstName: 'Juan',
        planType: 'monthly',
        isLifetime: false,
        activeUntil: monthsFrom(now, 1),
        amountPaid: { centavos: 19_900, currency: 'PHP' },
        testMode: true,
      })
    case 'complimentary':
      return renderComplimentaryProEmail({ firstName: 'Juan', validUntil: monthsFrom(now, 3), testMode: true })
    case 'founder-report':
      return renderFounderReportEmail(sampleReport(now), {
        missionControlUrl: founderDockUrl(FOUNDER_PATHS.missionControl),
        testMode: true,
      })
    case 'support-alert':
      return renderSupportAlertEmail({
        requester: 'Maria Santos',
        email: 'maria@example.com',
        subject: 'Payment issue',
        message: 'Hi! I paid for Pro through QR Ph but my account still shows Free. Can you check?',
        receivedAt: now.toISOString(),
        supportUrl: founderDockUrl(FOUNDER_PATHS.support),
        testMode: true,
      })
    case 'payment-received':
      return renderPaymentReceivedEmail({
        ...SAMPLE_CUSTOMER,
        planLabel: 'Monthly',
        amount: { centavos: 19_900, currency: 'PHP' },
        occurredAt: now.toISOString(),
        revenueUrl,
        testMode: true,
      })
    case 'payment-failed':
      return renderPaymentFailedEmail({
        ...SAMPLE_CUSTOMER,
        planLabel: 'Annual',
        amount: { centavos: 199_900, currency: 'PHP' },
        reason: 'The payment was not completed.',
        occurredAt: now.toISOString(),
        revenueUrl,
        testMode: true,
      })
  }
}

export type EmailSampleDeps = {
  /** Server configuration (MARKETING_TEST_EMAIL); never a caller-supplied address. */
  recipient: string | undefined
  send: (message: TransactionalMessage, idempotencyKey: string) => Promise<SendResult>
  now: Date
}

export type EmailSampleResult = { ok: true; id: string } | { ok: false; error: string }

/** An identical sample (same kind and content) reuses its idempotency key, so a double click sends once. */
export async function sendEmailSample(deps: EmailSampleDeps, kind: unknown): Promise<EmailSampleResult> {
  if (!isEmailSampleKind(kind)) return { ok: false, error: 'Unknown sample.' }
  const to = deps.recipient?.trim().toLowerCase()
  if (!isValidMarketingEmail(to)) return { ok: false, error: 'MARKETING_TEST_EMAIL is not configured.' }

  const email = buildEmailSample(kind, deps.now)
  const digest = createHash('sha256').update(`${email.subject}\n${email.html}`).digest('hex').slice(0, 24)
  const sent = await deps.send({ to, ...email }, `email-sample-${kind}-${digest}`)
  return sent.ok ? { ok: true, id: sent.id } : { ok: false, error: sent.error }
}
