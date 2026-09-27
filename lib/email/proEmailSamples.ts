/**
 * Founder-only [TEST] samples of the Pro emails, rendered from fixture data and sent to the
 * configured test inbox. Touches no database: no subscription, profile, payment or send log.
 */

import { createHash } from 'crypto'
import { isValidMarketingEmail } from '@/lib/email/marketingAudience'
import { renderComplimentaryProEmail, renderPaidProEmail, type RenderedEmail } from '@/lib/email/proEmails'
import type { SendResult, TransactionalMessage } from '@/lib/email/resend'

export const PRO_EMAIL_SAMPLE_KINDS = ['paid', 'complimentary'] as const
export type ProEmailSampleKind = (typeof PRO_EMAIL_SAMPLE_KINDS)[number]

export function isProEmailSampleKind(value: unknown): value is ProEmailSampleKind {
  return (PRO_EMAIL_SAMPLE_KINDS as readonly unknown[]).includes(value)
}

function monthsFrom(now: Date, months: number): string {
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

export function buildProEmailSample(kind: ProEmailSampleKind, now: Date): RenderedEmail {
  return kind === 'paid'
    ? renderPaidProEmail({
        firstName: 'Juan',
        planType: 'monthly',
        isLifetime: false,
        activeUntil: monthsFrom(now, 1),
        amountPaid: { centavos: 19_900, currency: 'PHP' },
        testMode: true,
      })
    : renderComplimentaryProEmail({ firstName: 'Juan', validUntil: monthsFrom(now, 3), testMode: true })
}

export type ProEmailSampleDeps = {
  /** Server configuration (MARKETING_TEST_EMAIL); never a caller-supplied address. */
  recipient: string | undefined
  send: (message: TransactionalMessage, idempotencyKey: string) => Promise<SendResult>
  now: Date
}

export type ProEmailSampleResult = { ok: true; id: string } | { ok: false; error: string }

/** An identical sample (same kind and content) reuses its idempotency key, so a double click sends once. */
export async function sendProEmailSample(deps: ProEmailSampleDeps, kind: unknown): Promise<ProEmailSampleResult> {
  if (!isProEmailSampleKind(kind)) return { ok: false, error: 'Unknown sample.' }
  const to = deps.recipient?.trim().toLowerCase()
  if (!isValidMarketingEmail(to)) return { ok: false, error: 'MARKETING_TEST_EMAIL is not configured.' }

  const email = buildProEmailSample(kind, deps.now)
  const digest = createHash('sha256').update(`${email.subject}\n${email.html}`).digest('hex').slice(0, 24)
  const sent = await deps.send({ to, ...email }, `pro-email-sample-${kind}-${digest}`)
  return sent.ok ? { ok: true, id: sent.id } : { ok: false, error: sent.error }
}
