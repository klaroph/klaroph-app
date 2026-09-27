/**
 * Server wiring for founder notifications: real Supabase lookups, Resend delivery and
 * FOUNDER_EMAIL. Logs outcomes only — never keys, recipients, payloads or message bodies.
 */

import { getResendConfig, sendTransactionalEmail } from '@/lib/email/resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadFounderSnapshot } from '@/lib/founder/data'
import { displayName } from '@/lib/founder/metrics'
import { loadSupportThreads } from '@/lib/founder/supportData'
import {
  founderRecipient,
  sendDailyFounderReport,
  sendPaymentAlert,
  sendSupportAlert,
  type AccountLookup,
  type AlertOutcome,
  type FounderMailer,
  type PaymentAlertInput,
  type SupportAlertInput,
} from '@/lib/founder/alerts'

function founderMailer(): FounderMailer | null {
  const resend = getResendConfig()
  return resend.ok ? (message, key) => sendTransactionalEmail(resend.config, message, key) : null
}

const lookupAccount: AccountLookup = async (userId) => {
  const [profile, auth] = await Promise.all([
    supabaseAdmin.from('profiles').select('nickname, full_name, user_type').eq('id', userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ])
  if (profile.error) throw new Error('Profile lookup failed.')
  const email = auth.data?.user?.email ?? null
  if (!profile.data) return email ? { name: null, email, isTester: false } : null
  return { name: displayName(profile.data), email, isTester: profile.data.user_type !== 'user' }
}

function log(kind: string, outcome: AlertOutcome) {
  if (outcome.status === 'failed') console.error(`[founder-alerts] ${kind} failed: ${outcome.error}`)
  else if (outcome.status === 'skipped') console.log(`[founder-alerts] ${kind} skipped: ${outcome.reason}`)
}

function delivery() {
  return { recipient: founderRecipient(), send: founderMailer(), lookupAccount }
}

export async function notifyFounderOfSupportRequest(input: SupportAlertInput): Promise<void> {
  log('support alert', await sendSupportAlert(delivery(), input))
}

export async function notifyFounderOfPayment(input: PaymentAlertInput): Promise<void> {
  log(`payment ${input.kind} alert`, await sendPaymentAlert(delivery(), input))
}

export async function runDailyFounderReport(now: Date): Promise<AlertOutcome & { reportDate: string }> {
  const outcome = await sendDailyFounderReport({
    ...delivery(),
    now,
    load: async () => {
      const [snapshot, support] = await Promise.all([
        loadFounderSnapshot(),
        loadSupportThreads().catch((e: unknown) => {
          console.error(`[founder-alerts] support threads failed: ${e instanceof Error ? e.message : 'unknown error'}`)
          return null
        }),
      ])
      return { snapshot, support }
    },
  })
  log('daily report', outcome)
  return outcome
}
