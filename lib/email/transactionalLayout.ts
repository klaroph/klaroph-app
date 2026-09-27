/**
 * Shared KlaroPH V2 shell for transactional emails (HTML + plain text): customer account emails
 * and private founder notifications. Table layout with inline styles so Gmail and mobile clients
 * render it without relying on <style>. Transactional only: no unsubscribe link, no campaign tags.
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
  positive: '#15803d',
  warning: '#b45309',
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

/** Operational tone sets the eyebrow color: attention (Klaro blue), positive (money in), warning (needs action). */
export type OperationalTone = 'attention' | 'positive' | 'warning'

/** A block of the operational card. Any combination of rows, bullet items and body text; empty parts are skipped. */
export type OperationalSection = {
  title: string
  rows?: EmailDetailRow[]
  items?: string[]
  /** Free text (e.g. a customer's message); newlines are preserved. */
  body?: string
  note?: string
}

export type OperationalEmailContent = {
  preheader: string
  label: string
  headline: string
  tone: OperationalTone
  intro?: string[]
  sections: OperationalSection[]
  cta: { label: string; url: string }
  footerReason: string
  testNotice?: string
}

const esc = escapeHtml
const eyebrow = (text: string, color: string = COLOR.primary, spacing = '0.12em', margin = '0 0 14px') =>
  `<p style="margin:${margin}; font-size:12px; font-weight:700; letter-spacing:${spacing}; text-transform:uppercase; color:${color};">${esc(text)}</p>`
const paragraph = (text: string) => `<p style="margin:0 0 12px; font-size:16px; line-height:1.6; color:${COLOR.text};">${esc(text)}</p>`

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

function listRows(items: readonly string[], marker: string): string {
  return items
    .map(
      (item) => `<tr>
                  <td width="26" style="padding:0 0 10px; vertical-align:top; font-size:15px; font-weight:700; color:${COLOR.primary};">${marker}</td>
                  <td style="padding:0 0 10px; font-size:15px; line-height:1.45; color:${COLOR.text};">${esc(item)}</td>
                </tr>`
    )
    .join('')
}

function ctaButton(cta: { label: string; url: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:10px; background-color:${COLOR.yellow};">
                    <a href="${esc(cta.url)}" style="display:inline-block; padding:14px 28px; border-radius:10px; font-size:16px; font-weight:700; color:${COLOR.ink}; text-decoration:none;">${esc(cta.label)}</a>
                  </td>
                </tr>
              </table>`
}

function shell(input: { title: string; preheader: string; testNotice?: string; card: string; footer: string[] }): string {
  const testBanner = input.testNotice
    ? `<tr>
          <td style="padding:0 0 16px;">
            <p style="margin:0; padding:12px 16px; border:1px solid ${COLOR.testBorder}; border-radius:10px; background-color:${COLOR.testBg}; font-size:14px; line-height:1.45; font-weight:600; color:${COLOR.testInk};">${esc(input.testNotice)}</p>
          </td>
        </tr>`
    : ''
  const [reason, ...notes] = input.footer

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(input.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLOR.environment}; font-family:${FONT}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${esc(input.preheader)}</div>
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
              ${input.card}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0;">
              <p style="margin:0 0 8px; font-size:13px; line-height:1.5; color:${COLOR.muted};"><strong style="color:${COLOR.ink};">KlaroPH</strong> · Clearer money habits start here. · <a href="https://klaroph.com" style="color:${COLOR.primary}; text-decoration:none;">klaroph.com</a></p>
              <p style="margin:0; font-size:12px; line-height:1.5; color:${COLOR.muted};">${esc(reason)}</p>
              ${notes.map((n) => `<p style="margin:10px 0 0; font-size:12px; line-height:1.5; color:${COLOR.muted};">${esc(n)}</p>`).join('')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const TEXT_FOOTER = '— KlaroPH · Clearer money habits start here. · klaroph.com'

export function renderTransactionalEmail(c: TransactionalEmailContent): { html: string; text: string } {
  const card = `${eyebrow(c.label, COLOR.primary, '0.14em', '0 0 10px')}
              <h1 style="margin:0 0 20px; font-size:26px; line-height:1.25; font-weight:800; color:${COLOR.ink};">${esc(c.headline)}</h1>
              ${paragraph(c.greeting)}
              ${c.paragraphs.map(paragraph).join('\n              ')}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 26px; background-color:${COLOR.panel}; border:1px solid ${COLOR.border}; border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    ${eyebrow(c.details.title)}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRows(c.details.rows)}
                    </table>
                    <p style="margin:16px 0 0; padding:14px 0 0; border-top:1px solid ${COLOR.border}; font-size:14px; line-height:1.5; color:${COLOR.text};">${esc(c.details.note)}</p>
                  </td>
                </tr>
              </table>

              ${eyebrow(c.features.title)}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                ${listRows(c.features.items, '&#10003;')}
              </table>

              ${ctaButton(c.cta)}

              <p style="margin:0; font-size:14px; line-height:1.55; color:${COLOR.muted};">${esc(c.closingNote)}</p>`

  const html = shell({
    title: c.headline,
    preheader: c.preheader,
    testNotice: c.testNotice,
    card,
    footer: [c.footerReason, ...(c.footnote ? [c.footnote] : [])],
  })

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
    TEXT_FOOTER,
    c.footerReason,
    ...(c.footnote ? [c.footnote] : []),
  ].join('\n')

  return { html, text }
}

function operationalSection(s: OperationalSection): string {
  const parts = [eyebrow(s.title)]
  if (s.rows?.length) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRows(s.rows)}
                    </table>`)
  }
  if (s.items?.length) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:${s.rows?.length ? '14px' : '0'} 0 -10px;">
                    ${listRows(s.items, '&bull;')}
                    </table>`)
  }
  if (s.body) {
    parts.push(
      `<p style="margin:0; font-size:15px; line-height:1.6; color:${COLOR.text}; white-space:pre-wrap; word-break:break-word;">${esc(s.body)}</p>`
    )
  }
  if (s.note) {
    parts.push(`<p style="margin:14px 0 0; font-size:14px; line-height:1.5; color:${COLOR.muted};">${esc(s.note)}</p>`)
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px; background-color:${COLOR.panel}; border:1px solid ${COLOR.border}; border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    ${parts.join('\n                    ')}
                  </td>
                </tr>
              </table>`
}

const TONE_COLOR: Record<OperationalTone, string> = { attention: COLOR.primary, positive: COLOR.positive, warning: COLOR.warning }

/** Compact operational card: tone eyebrow, headline, short intro, stacked sections, one CTA. */
export function renderOperationalEmail(c: OperationalEmailContent): { html: string; text: string } {
  const card = `${eyebrow(c.label, TONE_COLOR[c.tone], '0.14em', '0 0 10px')}
              <h1 style="margin:0 0 18px; font-size:24px; line-height:1.25; font-weight:800; color:${COLOR.ink};">${esc(c.headline)}</h1>
              ${(c.intro ?? []).map(paragraph).join('\n              ')}
              ${c.intro?.length ? '<div style="height:8px; line-height:8px;">&nbsp;</div>' : ''}
              ${c.sections.map(operationalSection).join('\n              ')}
              <div style="height:8px; line-height:8px;">&nbsp;</div>
              ${ctaButton(c.cta)}`

  const html = shell({ title: c.headline, preheader: c.preheader, testNotice: c.testNotice, card, footer: [c.footerReason] })

  const text = [
    ...(c.testNotice ? [c.testNotice, ''] : []),
    c.label.toUpperCase(),
    c.headline,
    '',
    ...(c.intro ?? []).flatMap((p) => [p, '']),
    ...c.sections.flatMap((s) => [
      s.title.toUpperCase(),
      ...(s.rows ?? []).map((row) => `${row.label}: ${row.value}`),
      ...(s.items ?? []).map((item) => `• ${item}`),
      ...(s.body ? [s.body] : []),
      ...(s.note ? [s.note] : []),
      '',
    ]),
    `${c.cta.label}: ${c.cta.url}`,
    '',
    TEXT_FOOTER,
    c.footerReason,
  ].join('\n')

  return { html, text }
}
