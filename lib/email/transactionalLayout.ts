/**
 * Shared KlaroPH V2 shell for transactional account emails (HTML + plain text).
 * Table layout with inline styles so Gmail and mobile clients render it without relying on <style>.
 * Transactional only: no unsubscribe link, no campaign tags.
 */

import { escapeHtml } from '@/lib/email/campaignTemplate'

const LOGO_URL = 'https://klaroph.com/logo-klaroph-blue.png'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const COLOR = {
  environment: '#eef5ff',
  surface: '#ffffff',
  border: '#dfeafc',
  panel: '#f5f9ff',
  primary: '#0038A8',
  ink: '#0b1f4d',
  text: '#334155',
  muted: '#64748b',
  yellow: '#FCD116',
  testBg: '#fff8db',
  testBorder: '#f3dc83',
  testInk: '#6b5200',
}

export type EmailDetailRow = { label: string; value: string }

export type TransactionalEmailContent = {
  preheader: string
  label: string
  headline: string
  greeting: string
  paragraphs: string[]
  details: { title: string; rows: EmailDetailRow[]; note: string }
  features: { title: string; items: readonly string[] }
  cta: { label: string; url: string }
  closingNote: string
  footerReason: string
  footnote?: string
  /** Sample sends only; production emails never set this. */
  testNotice?: string
}

const esc = escapeHtml

function detailRows(rows: EmailDetailRow[]): string {
  return rows
    .map(
      (row, i) => `<tr>
                      <td style="padding:${i === 0 ? '0' : '10px'} 12px 0 0; font-size:14px; color:${COLOR.muted}; vertical-align:top;">${esc(row.label)}</td>
                      <td align="right" style="padding:${i === 0 ? '0' : '10px'} 0 0; font-size:15px; font-weight:700; color:${COLOR.ink}; vertical-align:top;">${esc(row.value)}</td>
                    </tr>`
    )
    .join('')
}

function featureRows(items: readonly string[]): string {
  return items
    .map(
      (item) => `<tr>
                  <td width="26" style="padding:0 0 10px; vertical-align:top; font-size:15px; font-weight:700; color:${COLOR.primary};">&#10003;</td>
                  <td style="padding:0 0 10px; font-size:15px; line-height:1.45; color:${COLOR.text};">${esc(item)}</td>
                </tr>`
    )
    .join('')
}

export function renderTransactionalEmail(c: TransactionalEmailContent): { html: string; text: string } {
  const testBanner = c.testNotice
    ? `<tr>
          <td style="padding:0 0 16px;">
            <p style="margin:0; padding:12px 16px; border:1px solid ${COLOR.testBorder}; border-radius:10px; background-color:${COLOR.testBg}; font-size:14px; line-height:1.45; font-weight:600; color:${COLOR.testInk};">${esc(c.testNotice)}</p>
          </td>
        </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(c.headline)}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLOR.environment}; font-family:${FONT}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${esc(c.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.environment};">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px;">
          <tr>
            <td align="center" style="padding:0 0 22px;">
              <a href="https://klaroph.com" style="text-decoration:none;"><img src="${LOGO_URL}" alt="KlaroPH" width="132" style="display:block; width:132px; max-width:132px; height:auto; border:0;" /></a>
            </td>
          </tr>
          ${testBanner}
          <tr>
            <td style="background-color:${COLOR.surface}; border:1px solid ${COLOR.border}; border-radius:16px; box-shadow:0 1px 3px rgba(11,31,77,0.06); padding:36px 28px 32px;">
              <p style="margin:0 0 10px; font-size:12px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${COLOR.primary};">${esc(c.label)}</p>
              <h1 style="margin:0 0 20px; font-size:26px; line-height:1.25; font-weight:800; color:${COLOR.ink};">${esc(c.headline)}</h1>
              <p style="margin:0 0 12px; font-size:16px; line-height:1.6; color:${COLOR.text};">${esc(c.greeting)}</p>
              ${c.paragraphs.map((p) => `<p style="margin:0 0 12px; font-size:16px; line-height:1.6; color:${COLOR.text};">${esc(p)}</p>`).join('\n              ')}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 26px; background-color:${COLOR.panel}; border:1px solid ${COLOR.border}; border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 14px; font-size:12px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${COLOR.primary};">${esc(c.details.title)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRows(c.details.rows)}
                    </table>
                    <p style="margin:16px 0 0; padding:14px 0 0; border-top:1px solid ${COLOR.border}; font-size:14px; line-height:1.5; color:${COLOR.text};">${esc(c.details.note)}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 14px; font-size:12px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${COLOR.primary};">${esc(c.features.title)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                ${featureRows(c.features.items)}
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:10px; background-color:${COLOR.yellow};">
                    <a href="${esc(c.cta.url)}" style="display:inline-block; padding:14px 28px; border-radius:10px; font-size:16px; font-weight:700; color:${COLOR.ink}; text-decoration:none;">${esc(c.cta.label)}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0; font-size:14px; line-height:1.55; color:${COLOR.muted};">${esc(c.closingNote)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0;">
              <p style="margin:0 0 8px; font-size:13px; line-height:1.5; color:${COLOR.muted};"><strong style="color:${COLOR.ink};">KlaroPH</strong> · Clearer money habits start here. · <a href="https://klaroph.com" style="color:${COLOR.primary}; text-decoration:none;">klaroph.com</a></p>
              <p style="margin:0; font-size:12px; line-height:1.5; color:${COLOR.muted};">${esc(c.footerReason)}</p>
              ${c.footnote ? `<p style="margin:10px 0 0; font-size:12px; line-height:1.5; color:${COLOR.muted};">${esc(c.footnote)}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    ...(c.testNotice ? [c.testNotice, ''] : []),
    c.label.toUpperCase(),
    c.headline,
    '',
    c.greeting,
    '',
    ...c.paragraphs.flatMap((p) => [p, '']),
    c.details.title.toUpperCase(),
    ...c.details.rows.map((row) => `${row.label}: ${row.value}`),
    c.details.note,
    '',
    c.features.title.toUpperCase(),
    ...c.features.items.map((item) => `- ${item}`),
    '',
    `${c.cta.label}: ${c.cta.url}`,
    '',
    c.closingNote,
    '',
    '— KlaroPH · Clearer money habits start here. · klaroph.com',
    c.footerReason,
    ...(c.footnote ? [c.footnote] : []),
  ].join('\n')

  return { html, text }
}
