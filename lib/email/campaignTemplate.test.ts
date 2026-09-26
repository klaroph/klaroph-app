import { describe, expect, it } from 'vitest'
import { getMarketingCampaign } from './campaigns'
import { v2LaunchCampaign } from './campaigns/v2Launch'
import { getFirstName, renderCampaignEmail } from './campaignTemplate'
import { buildCampaignMessage } from './campaignSender'
import { verifyUnsubscribeToken } from './unsubscribeToken'

const ctx = { firstName: 'Juan', appUrl: 'https://klaroph.com', unsubscribeUrl: 'https://klaroph.com/unsubscribe?token=t' }

describe('getFirstName', () => {
  it('prefers nickname, falls back to the first word of full name', () => {
    expect(getFirstName('Jun', 'Juan Dela Cruz')).toBe('Jun')
    expect(getFirstName(null, '  Juan Dela Cruz ')).toBe('Juan')
  })

  it('returns null for missing or unsafe names', () => {
    expect(getFirstName(null, null)).toBeNull()
    expect(getFirstName('juan@example.com', '1234')).toBeNull()
  })
})

describe('renderCampaignEmail', () => {
  it('renders the V2 launch copy with greeting, flow, CTA, and unsubscribe link', () => {
    const { subject, html, text } = renderCampaignEmail(v2LaunchCampaign, ctx)
    expect(subject).toBe('KlaroPH V2 is here — your money, made Klaro.')
    expect(html).toContain('Hi Juan,')
    expect(html).toContain(v2LaunchCampaign.previewText.replace(/'/g, '&#39;'))
    expect(html).toContain('href="https://klaroph.com/dashboard"')
    expect(html).toContain('href="https://klaroph.com/unsubscribe?token=t"')
    expect(text).toContain('EARN → PLAN → SPEND → GROW')
    expect(text).toContain('Unsubscribe: https://klaroph.com/unsubscribe?token=t')
  })

  it('falls back to a neutral greeting and escapes names', () => {
    expect(renderCampaignEmail(v2LaunchCampaign, { ...ctx, firstName: null }).html).toContain('Hi there,')
    const html = renderCampaignEmail(v2LaunchCampaign, { ...ctx, firstName: '<b>Juan</b>' }).html
    expect(html).not.toContain('<b>Juan</b>')
    expect(html).toContain('&lt;b&gt;Juan&lt;/b&gt;')
  })

  it('is registered under its stable id', () => {
    expect(getMarketingCampaign('v2-launch-2026')).toBe(v2LaunchCampaign)
    expect(getMarketingCampaign('unknown')).toBeNull()
  })
})

describe('buildCampaignMessage', () => {
  const links = { appUrl: 'https://klaroph.com', unsubscribeSecret: 's'.repeat(40) }
  const recipient = { userId: '0a9851e6-db5d-4fcf-8010-34cb6b0d02b3', email: 'juan@example.com', firstName: 'Juan' }

  it('builds a per-recipient payload with one-click unsubscribe headers and campaign tags', () => {
    const message = buildCampaignMessage(v2LaunchCampaign, recipient, links)
    expect(message.to).toBe('juan@example.com')
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(message.tags).toEqual([
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: 'v2-launch-2026' },
    ])

    const oneClick = message.headers['List-Unsubscribe'].match(/^<(.+)>$/)?.[1] ?? ''
    expect(oneClick.startsWith('https://klaroph.com/api/email/unsubscribe?token=')).toBe(true)
    const token = decodeURIComponent(new URL(oneClick).searchParams.get('token') ?? '')
    expect(verifyUnsubscribeToken(token, links.unsubscribeSecret)).toBe(recipient.userId)
  })

  it('contains only profile-level personalization', () => {
    const message = buildCampaignMessage(v2LaunchCampaign, recipient, links)
    expect(message.html).not.toMatch(/₱|balance|transaction/i)
    expect(message.text).not.toMatch(/₱|balance|transaction/i)
  })
})
