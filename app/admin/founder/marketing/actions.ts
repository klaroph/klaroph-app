'use server'

import { revalidatePath } from 'next/cache'
import { getFounderUser } from '@/lib/founder/access'
import { getMarketingCampaign, type MarketingCampaign } from '@/lib/email/campaigns'
import { sendCampaignLive, sendCampaignTest, type CampaignActionResult } from '@/lib/email/campaignActions'
import { sendProEmailSample } from '@/lib/email/proEmailSamples'
import { getResendConfig, sendTransactionalEmail } from '@/lib/email/resend'

export type CampaignActionState = { ok: boolean; message: string }

function toState(result: CampaignActionResult, success: string): CampaignActionState {
  if (result.status === 200) return { ok: true, message: success }
  const error = typeof result.body.error === 'string' ? result.body.error : 'Something went wrong.'
  return { ok: false, message: error }
}

/** Every action re-verifies the founder session; campaign and recipients come from the server. */
async function authorizedCampaign(
  campaignId: string
): Promise<{ ok: true; campaign: MarketingCampaign } | { ok: false; state: CampaignActionState }> {
  if (!(await getFounderUser())) return { ok: false, state: { ok: false, message: 'Not authorized.' } }
  const campaign = getMarketingCampaign(campaignId)
  if (!campaign) return { ok: false, state: { ok: false, message: 'Unknown campaign.' } }
  return { ok: true, campaign }
}

export async function sendTestEmailAction(campaignId: string): Promise<CampaignActionState> {
  const auth = await authorizedCampaign(campaignId)
  if (!auth.ok) return auth.state
  return toState(await sendCampaignTest(auth.campaign), 'Test email accepted by Resend. Check the test inbox.')
}

/** The browser picks only which sample; content is fixture data and the recipient is the configured test inbox. */
export async function sendProEmailSampleAction(kind: string): Promise<CampaignActionState> {
  if (!(await getFounderUser())) return { ok: false, message: 'Not authorized.' }
  const config = getResendConfig()
  if (!config.ok) return { ok: false, message: config.error }
  const result = await sendProEmailSample(
    {
      recipient: process.env.MARKETING_TEST_EMAIL,
      send: (message, key) => sendTransactionalEmail(config.config, message, key),
      now: new Date(),
    },
    kind
  )
  if (!result.ok) return { ok: false, message: result.error }
  return { ok: true, message: `Sample accepted by Resend (${result.id}). Check the test inbox.` }
}

export async function sendCampaignAction(
  campaignId: string,
  input: { segment: string; confirmCampaignId: string; expectedRecipientCount: number }
): Promise<CampaignActionState> {
  const auth = await authorizedCampaign(campaignId)
  if (!auth.ok) return auth.state
  const result = await sendCampaignLive(auth.campaign, input)
  revalidatePath('/admin/founder', 'layout')
  if (result.status !== 200) return toState(result, '')
  const { sent, failed, skipped } = result.body as { sent: number; failed: number; skipped: number }
  return {
    ok: failed === 0,
    message: `Sent: ${sent} accepted, ${failed} failed, ${skipped} skipped.`,
  }
}
