/**
 * Server-only: KlaroPH Pro payment confirmation email, sent by the PayMongo webhook after
 * subscription activation (payment.paid / checkout_session.payment.paid). Never expose to frontend.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getFirstName } from '@/lib/email/campaignTemplate'
import { extractPaidAmount, renderPaidProEmail } from '@/lib/email/proEmails'
import { getResendConfig, sendTransactionalEmail } from '@/lib/email/resend'

/**
 * Idempotent: send premium confirmation email at most once per webhook event_id.
 * Inserts into premium_confirmation_emails; on unique violation skips send.
 * Plan facts come from the subscription row and the stored payment event. Never throws.
 */
export async function sendPremiumConfirmationIfNew(
  eventId: string,
  userId: string,
  planType: 'monthly' | 'annual'
): Promise<void> {
  try {
    const { error: insertError } = await supabaseAdmin
      .from('premium_confirmation_emails')
      .insert({ event_id: eventId, user_id: userId })
    if (insertError) return

    const config = getResendConfig()
    if (!config.ok) return

    const [{ data: authUser }, { data: profile }, { data: subscription }, { data: paymentEvent }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from('profiles').select('nickname, full_name').eq('id', userId).maybeSingle(),
      supabaseAdmin
        .from('subscriptions')
        .select('current_period_end, is_lifetime')
        .eq('user_id', userId)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from('payment_events').select('payload').eq('event_id', eventId).maybeSingle(),
    ])

    const email = authUser?.user?.email
    if (!email) return

    const names = (profile ?? {}) as { nickname?: string | null; full_name?: string | null }
    const sub = (subscription ?? {}) as { current_period_end?: string | null; is_lifetime?: boolean | null }
    const message = renderPaidProEmail({
      firstName: getFirstName(names.nickname, names.full_name),
      planType,
      isLifetime: sub.is_lifetime === true,
      activeUntil: sub.current_period_end ?? null,
      amountPaid: extractPaidAmount((paymentEvent as { payload?: unknown } | null)?.payload),
    })
    await sendTransactionalEmail(config.config, { to: email, ...message }, `premium-confirmation-${eventId}`)
  } catch {
    // Silent; payment fulfillment already completed
  }
}
