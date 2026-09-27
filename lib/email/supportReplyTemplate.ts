/**
 * Founder support reply email (transactional — no unsubscribe link, no campaign tags).
 * Only the reply and the user's own original request are included.
 */

import { escapeHtml } from '@/lib/email/campaignTemplate'

const LOGO_URL = 'https://klaroph.com/logo-klaroph-blue.png'
const ORIGINAL_EXCERPT_MAX = 600

export type SupportReplyInput = {
  firstName: string | null
  reply: string
  originalSubject: string | null
  originalMessage: string
  submittedOn: string
}

export type SupportReplyEmail = { subject: string; html: string; text: string }

function excerpt(message: string): string {
  const trimmed = message.trim()
  return trimmed.length > ORIGINAL_EXCERPT_MAX ? `${trimmed.slice(0, ORIGINAL_EXCERPT_MAX)}…` : trimmed
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export function renderSupportReplyEmail(input: SupportReplyInput): SupportReplyEmail {
  const topic = input.originalSubject?.trim()
  const subject = topic ? `Re: ${topic}` : 'Re: Your KlaroPH support request'
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi there,'
  const original = excerpt(input.originalMessage)

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
              <p style="margin:18px 0 0; font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#0038A8;">KlaroPH Support</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
              ${paragraphs(input.reply)}
              <p style="margin:6px 0 0; color:#6b7280; font-size:14px;">— KlaroPH Support</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;">
              <div style="padding:14px 16px; border-radius:10px; background-color:#f7faff; border:1px solid #dfeafc;">
                <p style="margin:0 0 6px; font-size:12px; font-weight:600; color:#6b7280;">Your request · ${escapeHtml(input.submittedOn)}${topic ? ` · ${escapeHtml(topic)}` : ''}</p>
                <p style="margin:0; font-size:14px; color:#4b5563;">${escapeHtml(original).replace(/\n/g, '<br />')}</p>
              </div>
              <p style="margin:16px 0 0; font-size:12px; color:#9ca3af;">You're receiving this because you contacted KlaroPH support. Need more help? Send a new request from inside KlaroPH.</p>
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
    input.reply,
    '',
    '— KlaroPH Support',
    '',
    `Your request (${input.submittedOn}${topic ? ` · ${topic}` : ''}):`,
    original,
    '',
    "You're receiving this because you contacted KlaroPH support. Need more help? Send a new request from inside KlaroPH.",
  ].join('\n')

  return { subject, html, text }
}
