/**
 * Server-only campaign operations shared by the Bearer founder API and the Founder Dock.
 * Callers must authorize the founder first; every send safeguard lives here.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { MarketingCampaign } from '@/lib/email/campaigns'
import { renderCampaignEmail } from '@/lib/email/campaignTemplate'
import { buildCampaignMessage, sendCampaign, type CampaignLinkConfig } from '@/lib/email/campaignSender'
import { isAudienceSegment, isValidMarketingEmail, loadMarketingAudience } from '@/lib/email/marketingAudience'
import { getResendConfig, sendCampaignBatch, type ResendConfig } from '@/lib/email/resend'
import { getUnsubscribeSecret } from '@/lib/email/unsubscribeToken'

/** Test sends use a token for a non-existent user, so the unsubscribe link is inert. */
const TEST_RECIPIENT_USER_ID = '00000000-0000-0000-0000-000000000000'

export type CampaignActionResult = { status: number; body: Record<string, unknown> }

export function campaignAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://klaroph.com').replace(/\/+$/, '')
}

export function campaignSendsEnabled(): boolean {
  return process.env.MARKETING_CAMPAIGN_SENDS_ENABLED === 'true'
}

function deliveryConfig():
  | { ok: true; resend: ResendConfig; links: CampaignLinkConfig }
  | { ok: false; error: string } {
  const resend = getResendConfig()
  if (!resend.ok) return resend
  const unsubscribeSecret = getUnsubscribeSecret()
  if (!unsubscribeSecret) return { ok: false, error: 'MARKETING_UNSUBSCRIBE_SECRET is missing or too short.' }
  return { ok: true, resend: resend.config, links: { appUrl: campaignAppUrl(), unsubscribeSecret } }
}

export function isCampaignDeliveryConfigured(): boolean {
  return deliveryConfig().ok
}

/** Rendered with a sample first name; the unsubscribe link is a placeholder. */
export function renderCampaignPreview(campaign: MarketingCampaign): string {
  return renderCampaignEmail(campaign, { firstName: 'Juan', appUrl: campaignAppUrl(), unsubscribeUrl: '#' }).html
}

/** One email to MARKETING_TEST_EMAIL. The recipient is never taken from the caller. */
export async function sendCampaignTest(campaign: MarketingCampaign): Promise<CampaignActionResult> {
  const testEmail = process.env.MARKETING_TEST_EMAIL?.trim().toLowerCase()
  if (!isValidMarketingEmail(testEmail)) return { status: 400, body: { error: 'MARKETING_TEST_EMAIL is not configured.' } }

  const config = deliveryConfig()
  if (!config.ok) return { status: 500, body: { error: config.error } }

  const message = buildCampaignMessage(
    campaign,
    { userId: TEST_RECIPIENT_USER_ID, email: testEmail, firstName: null },
    config.links
  )
  const result = await sendCampaignBatch(
    config.resend,
    [{ ...message, subject: `[TEST] ${message.subject}` }],
    `${campaign.id}-test-${Date.now()}`
  )
  if (!result.ok) {
    console.error(`[campaign ${campaign.id}] test send failed: ${result.error}`)
    return { status: 502, body: { error: 'Test send failed.' } }
  }
  return { status: 200, body: { ok: true, mode: 'test' } }
}

/**
 * Real send. Requires the kill switch, a repeated campaign id, and the exact recipient
 * count the founder previewed. Recipients are recomputed server-side.
 */
export async function sendCampaignLive(
  campaign: MarketingCampaign,
  request: { segment?: unknown; confirmCampaignId?: unknown; expectedRecipientCount?: unknown }
): Promise<CampaignActionResult> {
  if (!campaignSendsEnabled()) {
    return { status: 403, body: { error: 'Campaign sends are disabled (MARKETING_CAMPAIGN_SENDS_ENABLED).' } }
  }
  if (request.confirmCampaignId !== campaign.id) {
    return { status: 400, body: { error: 'confirmCampaignId must repeat the campaign id.' } }
  }
  const segment = request.segment ?? 'all'
  if (!isAudienceSegment(segment)) return { status: 400, body: { error: 'Invalid segment.' } }
  const expected = request.expectedRecipientCount
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1) {
    return { status: 400, body: { error: 'expectedRecipientCount must be the positive count from GET.' } }
  }

  const config = deliveryConfig()
  if (!config.ok) return { status: 500, body: { error: config.error } }

  const audience = await loadMarketingAudience(supabaseAdmin, campaign.id, segment)
  if (!audience.ok) {
    console.error(`[campaign ${campaign.id}] audience load failed: ${audience.error}`)
    return { status: 500, body: { error: 'Failed to load audience.' } }
  }
  if (audience.recipients.length === 0) return { status: 400, body: { error: 'No eligible recipients.' } }
  if (audience.recipients.length !== expected) {
    return {
      status: 409,
      body: { error: 'Audience changed since preview. Re-check the count and retry.', eligibleCount: audience.recipients.length },
    }
  }

  try {
    const summary = await sendCampaign(
      { admin: supabaseAdmin, resend: config.resend, links: config.links },
      campaign,
      audience.recipients
    )
    console.info(`[campaign ${campaign.id}] sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`)
    return { status: 200, body: { ok: true, mode: 'send', segment, ...summary } }
  } catch (e) {
    console.error(`[campaign ${campaign.id}] send aborted: ${e instanceof Error ? e.message : 'unknown error'}`)
    return { status: 500, body: { error: 'Campaign send aborted.' } }
  }
}
