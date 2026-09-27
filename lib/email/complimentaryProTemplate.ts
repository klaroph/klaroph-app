/**
 * Complimentary Pro notification (transactional account email — no unsubscribe link, no campaign tags).
 * Complimentary grants are always time-limited, so the email states the real end date and never claims lifetime access.
 */

import { escapeHtml } from '@/lib/email/campaignTemplate'

const LOGO_URL = 'https://klaroph.com/logo-klaroph-blue.png'
const APP_URL = 'https://klaroph.com/dashboard'
const PRO_FEATURES = ['Monthly Budgeting', 'Unlimited History & Insights', 'Advanced Charts', 'Export / Import CSV', 'Financial Clarity Tools']

export type ComplimentaryProInput = { firstName: string | null; validUntil: string }
export type ComplimentaryProEmail = { subject: string; html: string; text: string }

export function renderComplimentaryProEmail(input: ComplimentaryProInput): ComplimentaryProEmail {
  const subject = 'You now have KlaroPH Pro — on us'
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi there,'
  const intro = 'You have been given complimentary access to KlaroPH Pro. There is nothing to pay.'
  const validity = `Your Pro access is active until ${input.validUntil}. It will not renew or charge you automatically.`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#eef5ff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size:16px; line-height:1.55; color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef5ff; padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background-color:#ffffff; border:1px solid #dfeafc; border-radius:14px;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <img src="${LOGO_URL}" alt="KlaroPH" width="116" style="display:block; max-width:116px; height:auto;" />
              <p style="margin:18px 0 0; font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#0038A8;">KlaroPH Pro</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 14px;">${escapeHtml(intro)}</p>
              <p style="margin:0 0 8px;">Pro includes:</p>
              <ul style="margin:0 0 14px; padding-left:20px;">
                ${PRO_FEATURES.map((f) => `<li style="margin-bottom:4px;">${escapeHtml(f)}</li>`).join('')}
              </ul>
              <p style="margin:0 0 20px; padding:12px 14px; border-radius:10px; background-color:#f7faff; border:1px solid #dfeafc; font-size:15px;">${escapeHtml(validity)}</p>
              <a href="${APP_URL}" style="display:inline-block; padding:12px 22px; border-radius:10px; background-color:#FCD116; color:#002a80; font-weight:600; text-decoration:none;">Open KlaroPH</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0; color:#6b7280; font-size:14px;">— KlaroPH<br />Clearer money habits start here.</p>
              <p style="margin:14px 0 0; font-size:12px; color:#9ca3af;">You're receiving this because Pro access was added to your KlaroPH account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    '',
    intro,
    '',
    'Pro includes:',
    ...PRO_FEATURES.map((f) => `- ${f}`),
    '',
    validity,
    '',
    `Open KlaroPH: ${APP_URL}`,
    '',
    '— KlaroPH',
    '',
    "You're receiving this because Pro access was added to your KlaroPH account.",
  ].join('\n')

  return { subject, html, text }
}
