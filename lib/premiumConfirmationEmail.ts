/**
 * Server-only: send KlaroPH premium payment confirmation email via Resend.
 * Used by PayMongo webhook after subscription activation (payment.paid / checkout_session.payment.paid).
 * Same branded layout as welcome email. RESEND_API_KEY required. Never expose to frontend.
 */

import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const FROM = 'KlaroPH <hello@klaroph.com>'
const SUBJECT = 'Your KlaroPH Pro is now active'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format subscription end as "Month Day, Year" e.g. March 9, 2027. Returns null if invalid. */
function formatValidUntil(periodEnd: string | null | undefined): string | null {
  if (!periodEnd) return null
  const d = new Date(periodEnd)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function buildPremiumConfirmationHtml(
  firstName: string | null,
  planName: string,
  logoUrl: string,
  validUntilFormatted: string | null
): string {
  const tokens = firstName?.trim()?.split(/\s+/).filter(Boolean)
  const first = tokens?.[0] ?? null
  const greeting = first ? `Hi ${escapeHtml(first)},` : 'Hi there,'
  const planEscaped = escapeHtml(planName)
  const validityLine = validUntilFormatted
    ? `<p style="margin:0 0 12px;">Valid until: ${escapeHtml(validUntilFormatted)}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding: 24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%; background-color: #ffffff; border: 1px solid #eeeeee; border-radius: 12px;">
          <tr>
            <td align="center" style="padding: 32px 32px 20px 32px;">
              <img src="${logoUrl}" alt="KlaroPH" width="120" height="auto" style="display:block; max-width:120px; height:auto;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 32px 24px 32px;">
              <h1 style="margin:0; font-size: 22px; font-weight: 600; color: #1a1a1a;">Your KlaroPH Pro is now active</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <p style="margin:0 0 12px;">${greeting}</p>
              <p style="margin:0 0 12px;">Your payment has been successfully received, and your KlaroPH Pro access is now active.</p>
              <p style="margin:0 0 8px;">You now have access to Pro features including:</p>
              <ul style="margin:0 0 12px; padding-left: 20px;">
                <li style="margin-bottom: 4px;">Monthly Budgeting</li>
                <li style="margin-bottom: 4px;">Unlimited History &amp; Insights</li>
                <li style="margin-bottom: 4px;">Advanced Charts</li>
                <li style="margin-bottom: 4px;">Export / Import CSV</li>
                <li style="margin-bottom: 4px;">Financial Clarity Tools</li>
              </ul>
              <p style="margin:0 0 12px;">Plan: ${planEscaped}</p>
              ${validityLine}
              <p style="margin:0 0 20px;">Thank you for supporting KlaroPH.</p>
              <p style="margin:0; font-size: 14px; color: #6b7280; line-height: 1.5;">— KlaroPH<br />Clearer money habits start here.<br />klaroph.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Sends the premium confirmation email. Returns true if sent, false if skipped or failed.
 * Does not throw. Caller must not rely on this for payment fulfillment.
 */
async function sendPremiumConfirmationEmail(
  to: string,
  firstName: string | null,
  planName: string,
  validUntilFormatted: string | null
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey?.trim()) return false

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://klaroph.com'
  const logoUrl = `${baseUrl.replace(/\/$/, '')}/logo-klaroph-blue.png`
  const html = buildPremiumConfirmationHtml(firstName, planName, logoUrl, validUntilFormatted)

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: SUBJECT,
      html,
    })
    if (error) return false
    return !!data?.id
  } catch {
    return false
  }
}

/**
 * Idempotent: send premium confirmation email at most once per webhook event_id.
 * Inserts into premium_confirmation_emails; on unique violation skips send.
 * On success fetches user email and profile full_name, then sends. Never throws.
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

    if (insertError) {
      if (insertError.code === '23505') return
      return
    }

    const [{ data: authUser }, { data: profile }, { data: subscription }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      supabaseAdmin
        .from('subscriptions')
        .select('current_period_end')
        .eq('user_id', userId)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const email = authUser?.user?.email
    if (!email) return

    const fullName = (profile as { full_name?: string } | null)?.full_name ?? null
    const planName = planType === 'annual' ? 'Annual Pro' : 'Monthly Pro'
    const periodEnd = (subscription as { current_period_end?: string } | null)?.current_period_end
    const validUntilFormatted = formatValidUntil(periodEnd ?? null)
    await sendPremiumConfirmationEmail(email, fullName, planName, validUntilFormatted)
  } catch {
    // Silent; payment fulfillment already completed
  }
}
