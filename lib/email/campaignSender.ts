/**
 * Server-only campaign delivery. Each recipient is claimed in marketing_email_sends
 * (primary key campaign_id + user_id) before sending, so a campaign can never reach
 * the same user twice — even if the send is triggered again or runs concurrently.
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MarketingCampaign } from '@/lib/email/campaigns'
import { renderCampaignEmail } from '@/lib/email/campaignTemplate'
import type { MarketingRecipient } from '@/lib/email/marketingAudience'
import {
  RESEND_BATCH_LIMIT,
  sendCampaignBatch,
  type CampaignMessage,
  type ResendConfig,
} from '@/lib/email/resend'
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribePageUrl,
  createUnsubscribeToken,
} from '@/lib/email/unsubscribeToken'

/** Keeps batch requests under Resend's default rate limit (2 requests/second). */
const BATCH_PAUSE_MS = 600

export type CampaignLinkConfig = { appUrl: string; unsubscribeSecret: string }

export type CampaignSendDeps = {
  admin: SupabaseClient
  resend: ResendConfig
  links: CampaignLinkConfig
  sendBatch?: typeof sendCampaignBatch
  pause?: (ms: number) => Promise<void>
}

export type CampaignSendSummary = { sent: number; failed: number; skipped: number }

export function buildCampaignMessage(
  campaign: MarketingCampaign,
  recipient: MarketingRecipient,
  links: CampaignLinkConfig
): CampaignMessage {
  const token = createUnsubscribeToken(recipient.userId, links.unsubscribeSecret)
  const rendered = renderCampaignEmail(campaign, {
    firstName: recipient.firstName,
    appUrl: links.appUrl,
    unsubscribeUrl: buildUnsubscribePageUrl(links.appUrl, token),
  })
  return {
    to: recipient.email,
    ...rendered,
    headers: {
      'List-Unsubscribe': `<${buildOneClickUnsubscribeUrl(links.appUrl, token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: campaign.id },
    ],
  }
}

function batchIdempotencyKey(campaignId: string, userIds: string[]): string {
  const digest = createHash('sha256').update([...userIds].sort().join(',')).digest('hex').slice(0, 32)
  return `${campaignId}-${digest}`
}

async function claimRecipients(
  admin: SupabaseClient,
  campaignId: string,
  chunk: MarketingRecipient[]
): Promise<MarketingRecipient[]> {
  const { data, error } = await admin
    .from('marketing_email_sends')
    .upsert(
      chunk.map((r) => ({ campaign_id: campaignId, user_id: r.userId, status: 'pending' })),
      { onConflict: 'campaign_id,user_id', ignoreDuplicates: true }
    )
    .select('user_id')
  if (error) throw new Error(`claim failed: ${error.message}`)
  const claimed = new Set((data ?? []).map((row) => row.user_id as string))
  return chunk.filter((r) => claimed.has(r.userId))
}

/**
 * Claim each recipient, then send. `toMessage` builds one email per claimed user.
 * Shared by registered campaigns and the weekly summary (which is not a CAMPAIGNS entry).
 */
export async function sendClaimedRecipients(
  deps: CampaignSendDeps,
  campaignId: string,
  recipients: MarketingRecipient[],
  toMessage: (recipient: MarketingRecipient) => CampaignMessage
): Promise<CampaignSendSummary> {
  const sendBatch = deps.sendBatch ?? sendCampaignBatch
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const summary: CampaignSendSummary = { sent: 0, failed: 0, skipped: 0 }

  for (let i = 0; i < recipients.length; i += RESEND_BATCH_LIMIT) {
    if (i > 0) await pause(BATCH_PAUSE_MS)
    const chunk = recipients.slice(i, i + RESEND_BATCH_LIMIT)
    const claimed = await claimRecipients(deps.admin, campaignId, chunk)
    summary.skipped += chunk.length - claimed.length
    if (claimed.length === 0) continue

    const userIds = claimed.map((r) => r.userId)
    const result = await sendBatch(
      deps.resend,
      claimed.map((r) => toMessage(r)),
      batchIdempotencyKey(campaignId, userIds)
    )

    if (!result.ok) {
      summary.failed += claimed.length
      console.error(`[campaign ${campaignId}] batch of ${claimed.length} failed: ${result.error}`)
      const { error } = await deps.admin
        .from('marketing_email_sends')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .in('user_id', userIds)
      if (error) console.error(`[campaign ${campaignId}] could not release claims: ${error.message}`)
      continue
    }

    summary.sent += claimed.length
    const sentAt = new Date().toISOString()
    const { error } = await deps.admin.from('marketing_email_sends').upsert(
      claimed.map((r, idx) => ({
        campaign_id: campaignId,
        user_id: r.userId,
        status: 'sent',
        resend_email_id: result.ids[idx] ?? null,
        sent_at: sentAt,
      })),
      { onConflict: 'campaign_id,user_id' }
    )
    // Rows stay 'pending' on failure, which still blocks a resend — safe by design.
    if (error) console.error(`[campaign ${campaignId}] could not mark batch sent: ${error.message}`)
  }

  return summary
}

export async function sendCampaign(
  deps: CampaignSendDeps,
  campaign: MarketingCampaign,
  recipients: MarketingRecipient[]
): Promise<CampaignSendSummary> {
  return sendClaimedRecipients(deps, campaign.id, recipients, (recipient) =>
    buildCampaignMessage(campaign, recipient, deps.links)
  )
}
