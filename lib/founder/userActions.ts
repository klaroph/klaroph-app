/**
 * Founder user actions: grant complimentary Pro and delete an account. Storage and email are
 * passed in so every rule is testable without Supabase or Resend. Inputs are typed `unknown`:
 * they arrive from the browser, which supplies only the target user id and confirmation data.
 */

import { wipeUserAccount } from '@/lib/accountWipe'
import type { SendResult, TransactionalMessage } from '@/lib/email/resend'
import { renderComplimentaryProEmail } from '@/lib/email/proEmails'
import { getFirstName } from '@/lib/email/campaignTemplate'
import { isValidMarketingEmail } from '@/lib/email/marketingAudience'
import { formatFullDate } from '@/lib/founder/format'
import { planKind, type FounderSubscription } from '@/lib/founder/metrics'
import { COMPLIMENTARY_DURATIONS, DELETE_CONFIRMATION_PHRASE, isComplimentaryDuration, isPro } from '@/lib/founder/userList'
import { isUuid } from '@/lib/founder/support'

export type TargetSubscription = FounderSubscription & { id: string; plan_id: string }

export type TargetAccount = {
  id: string
  email: string | null
  nickname: string | null
  full_name: string | null
  subscription: TargetSubscription | null
}

export type GrantRow = {
  plan_id: string
  status: 'active'
  plan_type: 'monthly' | 'annual'
  payment_provider: 'manual'
  current_period_start: string
  current_period_end: string
  grace_period_until: null
  grace_period_used: false
  auto_renew: false
  is_lifetime: false
  paymongo_checkout_session_id: null
}

export type UserActionStore = {
  getAccount(userId: string): Promise<TargetAccount | null>
  getProPlanId(): Promise<string>
  /** Writes the grant only if the subscription is still exactly as read (null = no row yet). */
  applyGrant(userId: string, expected: TargetSubscription | null, row: GrantRow): Promise<'applied' | 'conflict'>
  /** Removes rows keyed by user_id that have no foreign key to auth.users, so no cascade reaches them. */
  deleteUnlinkedRows(userId: string): Promise<void>
  /** Deleting the auth user cascades to every table with an auth.users foreign key. */
  deleteAuthUser(userId: string): Promise<void>
}

export type UserActionMailer = (message: TransactionalMessage, idempotencyKey: string) => Promise<SendResult>

/** `warning`: the account change succeeded but its notification email did not go out. */
export type UserActionResult = { ok: boolean; message: string; warning?: boolean }

const NOT_FOUND: UserActionResult = { ok: false, message: 'User not found. Refresh and try again.' }

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function addMonths(from: Date, months: number): Date {
  const end = new Date(from)
  end.setUTCMonth(end.getUTCMonth() + months)
  return end
}

export async function grantComplimentaryPro(
  deps: { store: UserActionStore; mail: UserActionMailer; now: Date },
  input: { userId: unknown; duration: unknown }
): Promise<UserActionResult> {
  if (!isUuid(input.userId)) return NOT_FOUND
  if (!isComplimentaryDuration(input.duration)) return { ok: false, message: 'Choose how long Pro should last.' }
  const duration = COMPLIMENTARY_DURATIONS[input.duration]

  const account = await deps.store.getAccount(input.userId)
  if (!account) return NOT_FOUND
  if (isPro(planKind(account.subscription ?? undefined, deps.now))) {
    return { ok: false, message: 'This user already has Pro. Nothing was changed.' }
  }

  const periodEnd = addMonths(deps.now, duration.months)
  const row: GrantRow = {
    plan_id: await deps.store.getProPlanId(),
    status: 'active',
    plan_type: duration.planType,
    payment_provider: 'manual',
    current_period_start: deps.now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    grace_period_until: null,
    grace_period_used: false,
    auto_renew: false,
    is_lifetime: false,
    paymongo_checkout_session_id: null,
  }
  if ((await deps.store.applyGrant(account.id, account.subscription, row)) === 'conflict') {
    return { ok: false, message: "This user's plan changed while you were granting. Refresh and try again." }
  }

  const validUntil = formatFullDate(row.current_period_end)
  const granted = `Complimentary Pro granted until ${validUntil}.`
  const to = normalizeEmail(account.email)
  if (!isValidMarketingEmail(to)) return { ok: true, warning: true, message: `${granted} No valid email on file, so no notification was sent.` }

  const email = renderComplimentaryProEmail({ firstName: getFirstName(account.nickname, account.full_name), validUntil: row.current_period_end })
  const sent = await deps.mail({ to, ...email }, `complimentary-pro-${account.id}-${row.current_period_start}`)
  if (!sent.ok) {
    console.error(`[founder-users] complimentary Pro email failed: ${sent.error}`)
    return { ok: true, warning: true, message: `${granted} The notification email could not be sent — Pro access is unaffected.` }
  }
  return { ok: true, message: `${granted} The user has been emailed.` }
}

/**
 * Deletes the account through the shared wipe used by self-serve delete: unlinked rows first,
 * then the auth user, whose foreign keys cascade inside that single delete.
 * payment_events is not user-keyed and stays as the payment ledger.
 */
export async function deleteUserAccount(
  deps: {
    store: UserActionStore
    founder: { id: string; email: string }
    founderEmail: string | undefined
    /** The existing account-deleted confirmation email; returns false when not sent. */
    notifyDeleted: (email: string) => Promise<boolean>
  },
  input: { userId: unknown; confirmEmail: unknown; confirmPhrase: unknown }
): Promise<UserActionResult> {
  if (!isUuid(input.userId)) return NOT_FOUND
  if (input.confirmPhrase !== DELETE_CONFIRMATION_PHRASE) {
    return { ok: false, message: `Type ${DELETE_CONFIRMATION_PHRASE} to confirm.` }
  }

  const account = await deps.store.getAccount(input.userId)
  if (!account) return NOT_FOUND

  const email = normalizeEmail(account.email)
  const founderEmails = [normalizeEmail(deps.founder.email), normalizeEmail(deps.founderEmail)].filter(Boolean)
  if (account.id === deps.founder.id || founderEmails.includes(email)) {
    return { ok: false, message: 'The founder account cannot be deleted from Mission Control.' }
  }
  if (!email || typeof input.confirmEmail !== 'string' || normalizeEmail(input.confirmEmail) !== email) {
    return { ok: false, message: "The email you typed does not match this user's account." }
  }

  await wipeUserAccount(deps.store, account.id)
  const deleted = `${email} and their KlaroPH data were permanently deleted.`
  const notified = await deps.notifyDeleted(email).catch(() => false)
  return notified
    ? { ok: true, message: `${deleted} A confirmation email was sent.` }
    : { ok: true, warning: true, message: `${deleted} The confirmation email could not be sent.` }
}
