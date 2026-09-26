import { NextResponse } from 'next/server'
import { getFounderUser } from '@/lib/founder/access'
import { getMarketingCampaign } from '@/lib/email/campaigns'
import { renderCampaignPreview } from '@/lib/email/campaignActions'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const notFound = new NextResponse('Not found', { status: 404 })
  if (!(await getFounderUser())) return notFound
  const campaign = getMarketingCampaign((await params).campaignId)
  if (!campaign) return notFound
  return new NextResponse(renderCampaignPreview(campaign), {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
  })
}
