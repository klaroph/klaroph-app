import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeFounderDashboardRequest } from '@/lib/founderDashboardAuth'
import { getMarketingCampaign, type MarketingCampaign } from '@/lib/email/campaigns'
import {
  campaignSendsEnabled,
  renderCampaignPreview,
  sendCampaignLive,
  sendCampaignTest,
  type CampaignActionResult,
} from '@/lib/email/campaignActions'
import { isAudienceSegment, loadMarketingAudience } from '@/lib/email/marketingAudience'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type RouteParams = { params: Promise<{ campaignId: string }> }

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

const respond = (result: CampaignActionResult) => json(result.body, result.status)

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
    return new NextResponse(renderCampaignPreview(campaign), {
      headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' },
    })
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
    sendsEnabled: campaignSendsEnabled(),
  })
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

  if (body.action === 'test') return respond(await sendCampaignTest(auth.campaign))
  if (body.action === 'send') return respond(await sendCampaignLive(auth.campaign, body))
  return json({ error: "action must be 'test' or 'send'." }, 400)
}
