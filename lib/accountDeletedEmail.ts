/**
 * Server-only: send KlaroPH account-deleted confirmation email via Resend.
 * Used after successful account deletion. RESEND_API_KEY required. Never expose to frontend.
 */

import { Resend } from 'resend'

const FROM = 'KlaroPH <hello@klaroph.com>'
const SUBJECT = 'Your KlaroPH account has been deleted'

function buildAccountDeletedHtml(logoUrl: string, baseUrl: string): string {
  const privacyUrl = `${baseUrl.replace(/\/$/, '')}/privacy`
  const termsUrl = `${baseUrl.replace(/\/$/, '')}/terms`
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
              <h1 style="margin:0; font-size: 22px; font-weight: 600; color: #1a1a1a;">Your KlaroPH account has been deleted</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <p style="margin:0 0 12px;">Your KlaroPH account and associated personal data have been successfully deleted.</p>
              <p style="margin:0 0 12px;">This includes your profile, expenses, income records, budgets, goals, assets, liabilities, and subscription-related app data.</p>
              <p style="margin:0 0 12px;">You may create a new KlaroPH account anytime using the same email address, but it will begin as a new account with no access to previously deleted data.</p>
              <p style="margin:0 0 12px;">For reference:</p>
              <p style="margin:0 0 8px;"><a href="${privacyUrl}" style="color: #2563eb;">Privacy Policy</a></p>
              <p style="margin:0 0 20px;"><a href="${termsUrl}" style="color: #2563eb;">Terms of Service</a></p>
              <p style="margin:0; font-size: 14px; color: #6b7280; line-height: 1.5;">Thank you for using KlaroPH.</p>
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
 * Sends the account-deleted confirmation email. Returns true if sent, false if skipped or failed.
 * Does not throw. Caller should not block deletion on email failure.
 */
export async function sendAccountDeletedEmail(to: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey?.trim()) return false

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://klaroph.com'
  const logoUrl = 'https://klaroph.com/logo-klaroph-blue.png'
  const html = buildAccountDeletedHtml(logoUrl, baseUrl)

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
