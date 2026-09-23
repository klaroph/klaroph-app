import { isTimestampFresh, verifyWebhookSignature } from './paymongo'

export type WebhookAuthFailure = {
  ok: false
  status: number
  error: string
}

export type WebhookAuthSuccess = {
  ok: true
  timestamp: number
}

export type WebhookAuthResult = WebhookAuthFailure | WebhookAuthSuccess

/**
 * Gate PayMongo webhooks using the existing PAYMONGO_WEBHOOK_SECRET and raw body.
 * Does not log secrets or signature material.
 */
export function authorizePaymongoWebhook(params: {
  webhookSecret: string | undefined | null
  rawBody: string
  signatureHeader: string
  nowSeconds?: number
}): WebhookAuthResult {
  const webhookSecret =
    typeof params.webhookSecret === 'string' ? params.webhookSecret.trim() : ''
  if (!webhookSecret) {
    return { ok: false, status: 500, error: 'Webhook not configured' }
  }

  const signatureHeader = params.signatureHeader ?? ''
  if (!signatureHeader) {
    return { ok: false, status: 401, error: 'Missing signature' }
  }

  const { valid, timestamp } = verifyWebhookSignature(
    params.rawBody,
    signatureHeader,
    webhookSecret
  )

  if (!valid) {
    return { ok: false, status: 401, error: 'Invalid signature' }
  }

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!isTimestampFresh(timestamp, 300, nowSeconds)) {
    return { ok: false, status: 401, error: 'Stale webhook' }
  }

  return { ok: true, timestamp }
}
