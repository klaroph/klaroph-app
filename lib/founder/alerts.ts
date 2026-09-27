/**
 * Founder notification delivery: daily report and real-time support/payment alerts.
 * Delivery, recipient and lookups are injected so this core stays testable and database-free;
 * `alertsServer.ts` wires the real services. Every function resolves to an outcome and never
 * throws: a notification failure must never break the support insert or payment fulfillment.
 *
 * Idempotency: callers only notify after their own canonical dedupe (support insert id, PayMongo
 * event claim). The Resend idempotency key then makes a retried send a no-op on Resend's side.
 */

import { createHash } from 'crypto'
import { isValidMarketingEmail } from '@/lib/email/marketingAudience'
import type { PaidAmount } from '@/lib/email/proEmails'
import type { SendResult, TransactionalMessage } from '@/lib/email/resend'
import {
  renderFounderReportEmail,
  renderPaymentFailedEmail,
  renderPaymentReceivedEmail,
  renderSupportAlertEmail,
} from '@/lib/email/founderEmails'
import { buildFounderReport, manilaReportWindow, type ReportSnapshot } from '@/lib/founder/report'
import type { SupportThread } from '@/lib/founder/support'

const PRODUCTION_APP_URL = 'https://klaroph.com'
const REASON_MAX_LENGTH = 160

export const FOUNDER_PATHS = {
  missionControl: '/admin/founder',
  support: '/admin/founder/support',
  revenue: '/admin/founder/revenue',
} as const

export type FounderMailer = (message: TransactionalMessage, idempotencyKey: string) => Promise<SendResult>

export type AlertOutcome =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

/** Founder account facts needed to exclude testers and name the customer. Null = no profile found. */
export type AccountLookup = (userId: string) => Promise<{ name: string | null; email: string | null; isTester: boolean } | null>

type Env = Record<string, string | undefined>

/** The founder inbox comes only from server config (FOUNDER_EMAIL), never from a request. */
export function founderRecipient(env: Env = process.env): string | null {
  const email = env.FOUNDER_EMAIL?.trim().toLowerCase()
  return isValidMarketingEmail(email) ? email : null
}

/** Absolute Founder Dock link. Emails must never point at a local dev server. */
export function founderDockUrl(path: string, env: Env = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  const base =
    configured && configured.startsWith('https://') && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(configured)
      ? configured
      : PRODUCTION_APP_URL
  return `${base}${path}`
}

type Delivery = { recipient: string | null; send: FounderMailer | null }

async function deliver(
  delivery: Delivery,
  build: () => Promise<{ subject: string; html: string; text: string } | { skip: string }>,
  idempotencyKey: string
): Promise<AlertOutcome> {
  if (!delivery.recipient) return { status: 'skipped', reason: 'FOUNDER_EMAIL is not configured.' }
  if (!delivery.send) return { status: 'skipped', reason: 'Email delivery is not configured.' }
  try {
    const email = await build()
    if ('skip' in email) return { status: 'skipped', reason: email.skip }
    const result = await delivery.send({ to: delivery.recipient, ...email }, idempotencyKey)
    return result.ok ? { status: 'sent', id: result.id } : { status: 'failed', error: result.error }
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'Founder notification failed.' }
  }
}

// ---------------------------------------------------------------- Support

export type SupportAlertInput = {
  requestId: string
  userId: string
  email: string | null
  subject: string | null
  message: string
  createdAt: string
}

export function sendSupportAlert(
  deps: Delivery & { lookupAccount: AccountLookup; env?: Env },
  input: SupportAlertInput
): Promise<AlertOutcome> {
  return deliver(
    deps,
    async () => {
      const account = await deps.lookupAccount(input.userId)
      if (account?.isTester) return { skip: 'Tester support request.' }
      return renderSupportAlertEmail({
        requester: account?.name ?? null,
        email: input.email ?? account?.email ?? null,
        subject: input.subject,
        message: input.message,
        receivedAt: input.createdAt,
        supportUrl: founderDockUrl(FOUNDER_PATHS.support, deps.env),
      })
    },
    `founder-support-alert-${input.requestId}`
  )
}

// ---------------------------------------------------------------- Payments

export type PaymentAlertInput = {
  kind: 'paid' | 'failed'
  /** PayMongo event id — the webhook claims each event once before any handler runs. */
  eventId: string
  livemode: boolean
  userId: string | null
  planLabel: string | null
  amount: PaidAmount | null
  /** PayMongo failure reason (failed only); trimmed to a short safe string before rendering. */
  reason: string | null
  occurredAt: string
}

export function safeFailureReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > REASON_MAX_LENGTH ? `${text.slice(0, REASON_MAX_LENGTH - 1)}…` : text
}

export function sendPaymentAlert(
  deps: Delivery & { lookupAccount: AccountLookup; env?: Env },
  input: PaymentAlertInput
): Promise<AlertOutcome> {
  return deliver(
    deps,
    async () => {
      if (!input.livemode) return { skip: 'Test-mode payment.' }
      if (input.kind === 'paid' && !input.userId) return { skip: 'Payment has no KlaroPH account.' }
      const account = input.userId ? await deps.lookupAccount(input.userId) : null
      if (account?.isTester) return { skip: 'Tester payment.' }
      const email = {
        customer: account?.name ?? null,
        email: account?.email ?? null,
        planLabel: input.planLabel,
        amount: input.amount,
        occurredAt: input.occurredAt,
        revenueUrl: founderDockUrl(FOUNDER_PATHS.revenue, deps.env),
      }
      return input.kind === 'paid'
        ? renderPaymentReceivedEmail(email)
        : renderPaymentFailedEmail({ ...email, reason: safeFailureReason(input.reason) })
    },
    `founder-payment-${input.kind}-${input.eventId}`
  )
}

// ---------------------------------------------------------------- Daily report

export type DailyReportSources = { snapshot: ReportSnapshot; support: SupportThread[] | null }

/** One report per Manila reporting date and recipient; a re-run of the same day is a Resend no-op. */
export async function sendDailyFounderReport(
  deps: Delivery & { now: Date; load: () => Promise<DailyReportSources>; env?: Env }
): Promise<AlertOutcome & { reportDate: string }> {
  const reportDate = manilaReportWindow(deps.now).date
  const recipientHash = createHash('sha256').update(deps.recipient ?? '').digest('hex').slice(0, 12)
  const outcome = await deliver(
    deps,
    async () =>
      renderFounderReportEmail(buildFounderReport({ now: deps.now, ...(await deps.load()) }), {
        missionControlUrl: founderDockUrl(FOUNDER_PATHS.missionControl, deps.env),
      }),
    `founder-daily-report-${reportDate}-${recipientHash}`
  )
  return { ...outcome, reportDate }
}
