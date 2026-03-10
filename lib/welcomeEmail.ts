/**
 * Server-only: send KlaroPH welcome email via Resend.
 * Used by app/auth/callback after successful exchangeCodeForSession.
 * RESEND_API_KEY must be set in env. Never expose to frontend.
 */

import { Resend } from 'resend'

const FROM = 'KlaroPH <hello@klaroph.com>'
const SUBJECT = 'Welcome to KlaroPH — your money, made clearer'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildWelcomeHtml(firstName: string | null, logoUrl: string): string {
  const tokens = firstName?.trim()?.split(/\s+/).filter(Boolean)
  const first = tokens?.[0] ?? null
  const greeting = first ? `Hi ${escapeHtml(first)},` : 'Hi there,'
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
              <h1 style="margin:0; font-size: 22px; font-weight: 600; color: #1a1a1a;">Welcome to KlaroPH</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <p style="margin:0 0 12px;">${greeting}</p>
              <p style="margin:0 0 12px;">Welcome to KlaroPH.</p>
              <p style="margin:0 0 12px;">We built KlaroPH to help you track expenses, manage budgets, and stay focused on your financial goals with clarity.</p>
              <p style="margin:0 0 12px;">Your account is now ready, and you can begin adding expenses, setting budgets, and exploring your dashboard anytime.</p>
              <p style="margin:0 0 20px;">Thank you for joining KlaroPH.</p>
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
 * Sends the welcome email. Returns true if sent, false if skipped or failed.
 * Logs errors silently (no throw). Caller must not rely on this for auth flow.
 */
export async function sendWelcomeEmail(
  to: string,
  firstName: string | null,
  appUrl: string | undefined
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey?.trim()) return false

  const baseUrl = appUrl || 'https://klaroph.com'
  const logoUrl = `${baseUrl.replace(/\/$/, '')}/logo-klaroph-blue.png`
  const html = buildWelcomeHtml(firstName, logoUrl)

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: SUBJECT,
      html,
    })
    if (error) {
      return false
    }
    return !!data?.id
  } catch {
    return false
  }
}
