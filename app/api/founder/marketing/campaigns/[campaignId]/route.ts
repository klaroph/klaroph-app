import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeFounderDashboardRequest } from '@/lib/founderDashboardAuth'
import { getMarketingCampaign, type MarketingCampaign } from '@/lib/email/campaigns'
import { renderCampaignEmail } from '@/lib/email/campaignTemplate'
import { buildCampaignMessage, sendCampaign, type CampaignLinkConfig } from '@/lib/email/campaignSender'
import { isAudienceSegment, isValidMarketingEmail, loadMarketingAudience } from '@/lib/email/marketingAudience'
import { getResendConfig, sendCampaignBatch, type ResendConfig } from '@/lib/email/resend'
import { getUnsubscribeSecret } from '@/lib/email/unsubscribeToken'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Test sends use a token for a non-existent user, so the unsubscribe link is inert. */
const TEST_RECIPIENT_USER_ID = '00000000-0000-0000-0000-000000000000'

type RouteParams = { params: Promise<{ campaignId: string }> }

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://klaroph.com').replace(/\/+$/, '')
}

async function authorize(
  request: Request,
  params: RouteParams['params']
): Promise<{ ok: true; campaign: MarketingCampaign } | { ok: false; response: NextResponse }> {
  const authz = authorizeFounderDashboardRequest(
    request.headers.get('authorization'),
    process.env.FOUNDER_DASHBOARD_SECRET
  )
  if (!authz.ok) return { ok: false, response: json({ error: authz.error }, authz.status) }
  const { campaignId } = await params
  const campaign = getMarketingCampaign(campaignId)
  if (!campaign) return { ok: false, response: json({ error: 'Unknown campaign.' }, 404) }
  return { ok: true, campaign }
}

function deliveryConfig():
  | { ok: true; resend: ResendConfig; links: CampaignLinkConfig }
  | { ok: false; error: string } {
  const resend = getResendConfig()
  if (!resend.ok) return resend
  const unsubscribeSecret = getUnsubscribeSecret()
  if (!unsubscribeSecret) return { ok: false, error: 'MARKETING_UNSUBSCRIBE_SECRET is missing or too short.' }
  return { ok: true, resend: resend.config, links: { appUrl: appUrl(), unsubscribeSecret } }
}

/**
 * GET — campaign summary with recipient counts (no recipient data), or
 * `?format=html` for a rendered preview with a sample first name.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const auth = await authorize(request, params)
  if (!auth.ok) return auth.response
  const { campaign } = auth
  const url = new URL(request.url)

  if (url.searchParams.get('format') === 'html') {
    const { html } = renderCampaignEmail(campaign, { firstName: 'Juan', appUrl: appUrl(), unsubscribeUrl: '#' })
    return new NextResponse(html, { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const segment = url.searchParams.get('segment') ?? 'all'
  if (!isAudienceSegment(segment)) return json({ error: 'Invalid segment.' }, 400)

  const audience = await loadMarketingAudience(supabaseAdmin, campaign.id, segment)
  if (!audience.ok) {
    console.error(`[campaign ${campaign.id}] audience load failed: ${audience.error}`)
    return json({ error: 'Failed to load audience.' }, 500)
  }

  return json({
    campaign: { id: campaign.id, subject: campaign.subject, previewText: campaign.previewText },
    segment,
    eligibleCount: audience.recipients.length,
    alreadySentCount: audience.alreadySentCount,
    sendsEnabled: process.env.MARKETING_CAMPAIGN_SENDS_ENABLED === 'true',
  })
}

async function sendTest(campaign: MarketingCampaign) {
  const testEmail = process.env.MARKETING_TEST_EMAIL?.trim().toLowerCase()
  if (!isValidMarketingEmail(testEmail)) return json({ error: 'MARKETING_TEST_EMAIL is not configured.' }, 400)

  const config = deliveryConfig()
  if (!config.ok) return json({ error: config.error }, 500)

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
    return json({ error: 'Test send failed.' }, 502)
  }
  return json({ ok: true, mode: 'test' })
}

async function sendLive(campaign: MarketingCampaign, body: Record<string, unknown>) {
  if (process.env.MARKETING_CAMPAIGN_SENDS_ENABLED !== 'true') {
    return json({ error: 'Campaign sends are disabled (MARKETING_CAMPAIGN_SENDS_ENABLED).' }, 403)
  }
  if (body.confirmCampaignId !== campaign.id) {
    return json({ error: 'confirmCampaignId must repeat the campaign id.' }, 400)
  }
  const segment = body.segment ?? 'all'
  if (!isAudienceSegment(segment)) return json({ error: 'Invalid segment.' }, 400)
  const expected = body.expectedRecipientCount
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1) {
    return json({ error: 'expectedRecipientCount must be the positive count from GET.' }, 400)
  }

  const config = deliveryConfig()
  if (!config.ok) return json({ error: config.error }, 500)

  const audience = await loadMarketingAudience(supabaseAdmin, campaign.id, segment)
  if (!audience.ok) {
    console.error(`[campaign ${campaign.id}] audience load failed: ${audience.error}`)
    return json({ error: 'Failed to load audience.' }, 500)
  }
  if (audience.recipients.length === 0) return json({ error: 'No eligible recipients.' }, 400)
  if (audience.recipients.length !== expected) {
    return json(
      { error: 'Audience changed since preview. Re-check the count and retry.', eligibleCount: audience.recipients.length },
      409
    )
  }

  try {
    const summary = await sendCampaign(
      { admin: supabaseAdmin, resend: config.resend, links: config.links },
      campaign,
      audience.recipients
    )
    console.info(`[campaign ${campaign.id}] sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`)
    return json({ ok: true, mode: 'send', segment, ...summary })
  } catch (e) {
    console.error(`[campaign ${campaign.id}] send aborted: ${e instanceof Error ? e.message : 'unknown error'}`)
    return json({ error: 'Campaign send aborted.' }, 500)
  }
}

/**
 * POST — { action: 'test' } sends one email to MARKETING_TEST_EMAIL.
 * { action: 'send', segment, confirmCampaignId, expectedRecipientCount } sends the campaign.
 * Recipients are always computed server-side; any recipient list in the body is ignored.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authorize(request, params)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  if (body.action === 'test') return sendTest(auth.campaign)
  if (body.action === 'send') return sendLive(auth.campaign, body)
  return json({ error: "action must be 'test' or 'send'." }, 400)
}
