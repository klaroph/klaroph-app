/**
 * KlaroPH V2 campaign email renderer (HTML + plain text).
 * Personalization is limited to a first name — never pass financial data in here.
 */

import type { MarketingCampaign } from '@/lib/email/campaigns'

const LOGO_URL = 'https://klaroph.com/logo-klaroph-blue.png'

const COLOR = {
  environment: '#eef5ff',
  surface: '#ffffff',
  border: '#dfeafc',
  primary: '#0038A8',
  primaryDark: '#002766',
  yellow: '#FCD116',
  flagRed: '#CE1126',
  text: '#1f2937',
  muted: '#6b7280',
  softPanel: '#f7faff',
}

/** Pastel chip per flow step, cycling if a campaign lists more steps. */
const FLOW_TONES = [
  { bg: '#dbeafe', ink: '#1e40af' },
  { bg: '#fff8d6', ink: '#7a5c00' },
  { bg: '#fde2e4', ink: '#9f1239' },
  { bg: '#d1fae5', ink: '#065f46' },
]

export type CampaignRenderContext = {
  firstName: string | null
  appUrl: string
  unsubscribeUrl: string
}

export type RenderedCampaignEmail = { subject: string; html: string; text: string }

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** First name for "Hi {firstName}," from basic profile fields only. */
export function getFirstName(nickname: string | null | undefined, fullName: string | null | undefined): string | null {
  for (const source of [nickname, fullName]) {
    const first = source?.trim().split(/\s+/)[0]
    if (first && first.length <= 40 && !first.includes('@') && /\p{L}/u.test(first)) return first
  }
  return null
}

function greeting(firstName: string | null): string {
  return firstName ? `Hi ${firstName},` : 'Hi there,'
}

function renderFlowHtml(flow: string[]): string {
  const arrow = `<td style="padding:0 4px; color:#94a3b8; font-size:14px;">&rarr;</td>`
  const chips = flow.map((step, i) => {
    const tone = FLOW_TONES[i % FLOW_TONES.length]
    return `<td style="padding:0;"><span style="display:inline-block; padding:6px 12px; border-radius:999px; background:${tone.bg}; color:${tone.ink}; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">${escapeHtml(step)}</span></td>`
  })
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${chips.join(arrow)}</tr></table>`
}

function renderFeaturesHtml(campaign: MarketingCampaign): string {
  const rows = campaign.features
    .map((f, i) => {
      const tone = FLOW_TONES[i % FLOW_TONES.length]
      return `<tr>
        <td width="14" valign="top" style="padding:6px 0 0 0;"><span style="display:inline-block; width:8px; height:8px; border-radius:999px; background:${tone.ink};"></span></td>
        <td style="padding:0 0 14px 8px;">
          <p style="margin:0; font-weight:600; color:${COLOR.primaryDark};">${escapeHtml(f.title)}</p>
          <p style="margin:2px 0 0; color:${COLOR.text};">${escapeHtml(f.body)}</p>
        </td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.softPanel}; border-radius:12px;">
    <tr><td style="padding:20px 20px 6px 20px;">
      <p style="margin:0 0 12px; font-size:13px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.primary};">${escapeHtml(campaign.featuresTitle)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr>
  </table>`
}

function renderHtml(campaign: MarketingCampaign, ctx: CampaignRenderContext, ctaUrl: string): string {
  const paragraphs = (lines: string[], style: string) =>
    lines.map((line) => `<p style="margin:0 0 12px; ${style}">${escapeHtml(line)}</p>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(campaign.subject)}</title></head>
<body style="margin:0; padding:0; background:${COLOR.environment}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size:16px; line-height:1.55; color:${COLOR.text};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(campaign.previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.environment}; padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:${COLOR.surface}; border:1px solid ${COLOR.border}; border-radius:16px; overflow:hidden;">
        <tr><td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td height="4" style="height:4px; background:${COLOR.primary}; font-size:0; line-height:0;">&nbsp;</td>
            <td height="4" width="18%" style="height:4px; background:${COLOR.flagRed}; font-size:0; line-height:0;">&nbsp;</td>
            <td height="4" width="18%" style="height:4px; background:${COLOR.yellow}; font-size:0; line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:28px 32px 8px;">
          <img src="${LOGO_URL}" alt="KlaroPH" width="120" style="display:block; max-width:120px; height:auto;" />
        </td></tr>
        <tr><td align="center" style="padding:12px 32px 4px;">
          <h1 style="margin:0; font-size:26px; line-height:1.25; font-weight:700; color:${COLOR.primary};">${escapeHtml(campaign.headline)}</h1>
        </td></tr>
        <tr><td style="padding:20px 32px 4px;">
          <p style="margin:0 0 12px;">${escapeHtml(greeting(ctx.firstName))}</p>
          ${paragraphs(campaign.intro, '')}
        </td></tr>
        <tr><td align="center" style="padding:8px 24px 20px;">${renderFlowHtml(campaign.flow)}</td></tr>
        <tr><td style="padding:0 32px 8px;">${renderFeaturesHtml(campaign)}</td></tr>
        <tr><td align="center" style="padding:24px 32px 8px;">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; padding:14px 30px; border-radius:999px; background:${COLOR.yellow}; color:${COLOR.primaryDark}; font-weight:700; text-decoration:none;">${escapeHtml(campaign.cta.label)}</a>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;">
          ${paragraphs(campaign.closing, `color:${COLOR.primaryDark}; font-weight:600;`)}
          <p style="margin:0 0 16px;">${escapeHtml(campaign.signoff)}</p>
          ${campaign.postscript ? `<p style="margin:0; font-size:14px; color:${COLOR.muted};">${escapeHtml(campaign.postscript)}</p>` : ''}
        </td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%;">
        <tr><td align="center" style="padding:18px 24px 0; font-size:12px; line-height:1.6; color:${COLOR.muted};">
          You're receiving this because you have a KlaroPH account.<br />
          <a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:${COLOR.muted}; text-decoration:underline;">Unsubscribe from KlaroPH updates</a><br />
          KlaroPH &middot; Built in the Philippines &middot; klaroph.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function renderText(campaign: MarketingCampaign, ctx: CampaignRenderContext, ctaUrl: string): string {
  return [
    campaign.headline,
    '',
    greeting(ctx.firstName),
    '',
    ...campaign.intro.flatMap((line) => [line, '']),
    campaign.flow.map((s) => s.toUpperCase()).join(' → '),
    '',
    `${campaign.featuresTitle}:`,
    ...campaign.features.map((f) => `• ${f.title} — ${f.body}`),
    '',
    `${campaign.cta.label} ${ctaUrl}`,
    '',
    ...campaign.closing,
    '',
    campaign.signoff,
    ...(campaign.postscript ? ['', campaign.postscript] : []),
    '',
    "You're receiving this because you have a KlaroPH account.",
    `Unsubscribe: ${ctx.unsubscribeUrl}`,
  ].join('\n')
}

export function renderCampaignEmail(campaign: MarketingCampaign, ctx: CampaignRenderContext): RenderedCampaignEmail {
  const ctaUrl = `${ctx.appUrl}${campaign.cta.path}`
  return {
    subject: campaign.subject,
    html: renderHtml(campaign, ctx, ctaUrl),
    text: renderText(campaign, ctx, ctaUrl),
  }
}
