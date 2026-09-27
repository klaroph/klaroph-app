/**
 * KlaroPH Pro transactional emails: paid confirmation and complimentary grant.
 * Every fact shown (plan, amount, dates, lifetime) comes from the caller's real entitlement;
 * a missing fact is omitted, never guessed. Pro is prepaid, so no email claims automatic renewal.
 */

import { PRO_PLAN_FEATURES } from '@/lib/planFeatures'
import { renderTransactionalEmail, type EmailDetailRow } from '@/lib/email/transactionalLayout'

const APP_URL = 'https://klaroph.com/dashboard'
const CTA = { label: 'Open KlaroPH →', url: APP_URL }
const PRO_FEATURES = PRO_PLAN_FEATURES.filter((f) => f.premium).map((f) => f.label)
const TEST_SUBJECT_PREFIX = '[TEST] '

export type RenderedEmail = { subject: string; html: string; text: string }
export type PaidAmount = { centavos: number; currency: string }

export type PaidProEmailInput = {
  firstName: string | null
  planType: 'monthly' | 'annual'
  isLifetime: boolean
  /** subscriptions.current_period_end (ISO). */
  activeUntil: string | null
  amountPaid: PaidAmount | null
  testMode?: boolean
}

export type ComplimentaryProEmailInput = {
  firstName: string | null
  /** subscriptions.current_period_end of the grant (ISO). */
  validUntil: string
  testMode?: boolean
}

/** KlaroPH runs on Philippine time. Returns null for a missing or invalid date. */
export function formatEmailDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatPaidAmount(amount: PaidAmount | null): string | null {
  if (!amount || !Number.isInteger(amount.centavos) || amount.centavos <= 0) return null
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: amount.currency.toUpperCase() }).format(amount.centavos / 100)
  } catch {
    return null
  }
}

/** Payment amount from a PayMongo payment.paid, payment.failed or checkout_session.payment.paid event. */
export function extractPaidAmount(payload: unknown): PaidAmount | null {
  const resource = (payload as { data?: { attributes?: { data?: { attributes?: Record<string, unknown> } } } } | null)?.data
    ?.attributes?.data?.attributes
  if (!resource) return null
  const payments = resource.payments as { attributes?: Record<string, unknown> }[] | undefined
  const source = Array.isArray(payments) ? payments[0]?.attributes : resource
  const centavos = source?.amount
  const currency = source?.currency
  if (typeof centavos !== 'number' || typeof currency !== 'string') return null
  return formatPaidAmount({ centavos, currency }) ? { centavos, currency } : null
}

function greeting(firstName: string | null): string {
  return firstName ? `Hi ${firstName},` : 'Hi there,'
}

export function renderPaidProEmail(input: PaidProEmailInput): RenderedEmail {
  const period = input.planType === 'annual' ? 'Annual' : 'Monthly'
  const activeUntil = formatEmailDate(input.activeUntil)
  const amount = formatPaidAmount(input.amountPaid)

  const rows: EmailDetailRow[] = [{ label: 'Plan', value: input.isLifetime ? 'KlaroPH Pro · Lifetime' : `KlaroPH Pro · ${period}` }]
  if (amount) rows.push({ label: 'Amount paid', value: amount })
  if (input.isLifetime) rows.push({ label: 'Access', value: 'Lifetime' })
  else if (activeUntil) rows.push({ label: 'Active until', value: activeUntil })

  const { html, text } = renderTransactionalEmail({
    preheader: 'Your Pro access is active. Here’s everything that’s included.',
    label: 'KlaroPH Pro',
    headline: 'You’re officially KlaroPH Pro.',
    greeting: greeting(input.firstName),
    paragraphs: ['Thanks for upgrading. Your KlaroPH account now has access to the full Pro experience.'],
    details: {
      title: 'Your plan',
      rows,
      note: input.isLifetime
        ? 'Your Pro access doesn’t expire, and there’s nothing more to pay.'
        : 'Pro is prepaid. It won’t renew or charge you automatically — when it ends, you can renew anytime from KlaroPH.',
    },
    features: { title: 'What’s included', items: PRO_FEATURES },
    cta: CTA,
    closingNote: 'Questions about your payment? Reach us anytime through Support in KlaroPH.',
    footerReason: 'You’re receiving this account notification because of a Pro purchase on your KlaroPH account.',
    footnote:
      'Fair use note: KlaroPH Pro is intended for personal, legitimate use. We apply safeguards against abuse and fraudulent activity to protect users and platform reliability.',
    testNotice: input.testMode ? 'This is a KlaroPH sample email. No payment was made and no subscription was changed.' : undefined,
  })

  const subject = 'You’re officially KlaroPH Pro'
  return { subject: input.testMode ? `${TEST_SUBJECT_PREFIX}${subject}` : subject, html, text }
}

export function renderComplimentaryProEmail(input: ComplimentaryProEmailInput): RenderedEmail {
  const validUntil = formatEmailDate(input.validUntil)
  if (!validUntil) throw new Error('Complimentary Pro email needs a valid end date.')

  const { html, text } = renderTransactionalEmail({
    preheader: `Complimentary Pro access is active on your account until ${validUntil}.`,
    label: 'KlaroPH Pro',
    headline: 'You’ve got KlaroPH Pro — on us.',
    greeting: greeting(input.firstName),
    paragraphs: [
      'We’ve added complimentary Pro access to your account. There’s nothing to pay and nothing will be charged automatically.',
    ],
    details: {
      title: 'Your Pro access',
      rows: [
        { label: 'Plan', value: 'KlaroPH Pro · Complimentary' },
        { label: 'Active until', value: validUntil },
      ],
      note: 'This complimentary access will not renew or charge you automatically.',
    },
    features: { title: 'What’s included', items: PRO_FEATURES },
    cta: CTA,
    closingNote: 'Questions? Reach us anytime through Support in KlaroPH.',
    footerReason: 'You’re receiving this account notification because Pro access was added to your KlaroPH account.',
    testNotice: input.testMode ? 'This is a KlaroPH sample email. No Pro access was granted and no account was changed.' : undefined,
  })

  const subject = 'You’ve got KlaroPH Pro — on us'
  return { subject: input.testMode ? `${TEST_SUBJECT_PREFIX}${subject}` : subject, html, text }
}
