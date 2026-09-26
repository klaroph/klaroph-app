/**
 * Server-only Resend delivery for marketing campaigns.
 * RESEND_API_KEY must never be read by client code, prefixed NEXT_PUBLIC_, or logged.
 */

import { Resend } from 'resend'
import { getResendFrom } from '@/lib/resendFrom'

/** Resend batch endpoint accepts at most 100 emails per request. */
export const RESEND_BATCH_LIMIT = 100

export type ResendConfig = { apiKey: string; from: string }

export type ResendConfigResult =
  | { ok: true; config: ResendConfig }
  | { ok: false; error: string }

export type CampaignMessage = {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  tags: { name: string; value: string }[]
}

export type BatchSendResult = { ok: true; ids: string[] } | { ok: false; error: string }

export function getResendConfig(env: Record<string, string | undefined> = process.env): ResendConfigResult {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured.' }
  return { ok: true, config: { apiKey, from: getResendFrom() } }
}

/**
 * Sends one Resend batch. The idempotency key makes a retried request for the
 * same batch a no-op on Resend's side.
 */
export async function sendCampaignBatch(
  config: ResendConfig,
  messages: CampaignMessage[],
  idempotencyKey: string
): Promise<BatchSendResult> {
  if (messages.length === 0) return { ok: false, error: 'Batch is empty.' }
  if (messages.length > RESEND_BATCH_LIMIT) {
    return { ok: false, error: `Batch exceeds ${RESEND_BATCH_LIMIT} emails.` }
  }

  try {
    const resend = new Resend(config.apiKey)
    const { data, error } = await resend.batch.send(
      messages.map((m) => ({ from: config.from, ...m })),
      { idempotencyKey }
    )
    if (error) return { ok: false, error: error.message || 'Resend rejected the batch.' }
    return { ok: true, ids: data?.data.map((d) => d.id) ?? [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resend request failed.' }
  }
}
