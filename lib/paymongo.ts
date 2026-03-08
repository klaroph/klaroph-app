/**
 * PayMongo server-side API wrapper.
 * NEVER import this file from client components — secret key must stay server-side.
 *
 * Auth: Basic base64(secretKey + ':') — secret key as username, empty password.
 * Key must be the SECRET key (sk_test_... or sk_live_...), not the public key.
 */

const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1'

function getSecretKey(): string {
  const raw = process.env.PAYMONGO_SECRET_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  if (!key) {
    throw new PayMongoError('PAYMONGO_SECRET_KEY is not set', 500, null)
  }
  // PayMongo expects secret key (sk_test_ or sk_live_); public key (pk_*) will cause "Invalid merchant key format"
  if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
    throw new PayMongoError(
      'PAYMONGO_SECRET_KEY must be a PayMongo SECRET key (starts with sk_test_ or sk_live_). You may have used the public key (pk_).',
      500,
      null
    )
  }
  return key
}

function authHeader(): string {
  const key = getSecretKey()
  return 'Basic ' + Buffer.from(key + ':').toString('base64')
}

async function paymongoRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${PAYMONGO_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...options.headers,
    },
  })

  const body = await res.json()

  if (!res.ok) {
    const msg =
      body?.errors?.[0]?.detail ??
      body?.errors?.[0]?.code ??
      `PayMongo API error ${res.status}`
    throw new PayMongoError(msg, res.status, body)
  }

  return body as T
}

export class PayMongoError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message)
    this.name = 'PayMongoError'
  }
}

// ---------------------------------------------------------------------------
// Checkout Sessions (supports GCash, Maya, Card)
// ---------------------------------------------------------------------------

export type CheckoutLineItem = {
  amount: number   // in centavos (₱149 = 14900)
  currency: 'PHP'
  name: string
  quantity: number
  description?: string
}

export type CreateCheckoutParams = {
  lineItems: CheckoutLineItem[]
  description?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  billingEmail?: string
  billingName?: string
  referenceNumber?: string
}

export type CheckoutSessionResponse = {
  data: {
    id: string
    type: 'checkout_session'
    attributes: {
      checkout_url: string
      status: string
      payments: Array<{ id: string; type: string; attributes: Record<string, unknown> }>
      metadata: Record<string, string> | null
      [key: string]: unknown
    }
  }
}

export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutSessionResponse> {
  // PayMongo: metadata must be under data.attributes; only string values accepted
  const attributes: Record<string, unknown> = {
    line_items: params.lineItems,
    payment_method_types: ['gcash', 'paymaya', 'card'],
    description: params.description,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    send_email_receipt: true,
    show_description: true,
    show_line_items: true,
    reference_number: params.referenceNumber,
    ...(params.billingEmail || params.billingName
      ? {
          billing: {
            email: params.billingEmail,
            name: params.billingName,
          },
        }
      : {}),
    metadata: params.metadata ?? {},
  }

  return paymongoRequest<CheckoutSessionResponse>('/checkout_sessions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes,
      },
    }),
  })
}

export async function retrieveCheckoutSession(
  sessionId: string
): Promise<CheckoutSessionResponse> {
  return paymongoRequest<CheckoutSessionResponse>(
    `/checkout_sessions/${sessionId}`
  )
}

// ---------------------------------------------------------------------------
// Subscriptions (Card + Maya auto-recurring — future use)
// ---------------------------------------------------------------------------

export type CreateSubscriptionParams = {
  customerId: string
  planId: string
}

export type SubscriptionResponse = {
  data: {
    id: string
    type: 'subscription'
    attributes: {
      status: string
      customer_id: string
      plan_id: string
      next_billing_schedule: string | null
      cancelled_at: number | null
      created_at: number
      updated_at: number
      latest_invoice?: {
        payment_intent?: { id: string }
      }
      [key: string]: unknown
    }
  }
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<SubscriptionResponse> {
  return paymongoRequest<SubscriptionResponse>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: {
          customer_id: params.customerId,
          plan_id: params.planId,
        },
      },
    }),
  })
}

export async function retrieveSubscription(
  subscriptionId: string
): Promise<SubscriptionResponse> {
  return paymongoRequest<SubscriptionResponse>(
    `/subscriptions/${subscriptionId}`
  )
}

export async function cancelSubscription(
  subscriptionId: string,
  reason?: string
): Promise<SubscriptionResponse> {
  return paymongoRequest<SubscriptionResponse>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            reason: reason ?? 'user_requested',
          },
        },
      }),
    }
  )
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify PayMongo webhook signature (official spec: Securing a Webhook).
 * Header: three comma-separated parts — t (timestamp), te (test), li (live).
 * Sample test mode: t=1496734173,te=1447a89e...,li=  (li is empty in test).
 * Signature string: timestamp + "." + raw JSON body. HMAC-SHA256(secret, that string), hex digest.
 * Use te for test mode events, li for live mode events. If li is empty, use te.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): { valid: boolean; timestamp: number } {
  const parts: Record<string, string> = {}
  for (const segment of signatureHeader.split(',')) {
    const [key, ...rest] = segment.split('=')
    parts[key.trim()] = rest.join('=').trim()
  }

  const timestamp = parseInt(parts.t, 10)
  if (!timestamp || isNaN(timestamp)) {
    return { valid: false, timestamp: 0 }
  }

  // Use li for live mode events, te for test mode. PayMongo sends li= (empty) in test mode, so prefer li only when non-empty.
  const expectedSig = (parts.li && parts.li.trim()) ? parts.li : parts.te

  if (!expectedSig || !expectedSig.trim()) {
    return { valid: false, timestamp }
  }

  const payload = `${timestamp}.${rawBody}`
  // Digest must be hex to match PayMongo header (te/li are hex). Do not use base64.
  const computed = createHmac('sha256', webhookSecret)
    .update(payload, 'utf8')
    .digest('hex')

  // Compare: both expectedSig and computed are hex strings; decode to buffers for timingSafeEqual.
  const sigBuffer = Buffer.from(expectedSig, 'hex')
  const computedBuffer = Buffer.from(computed, 'hex')

  if (sigBuffer.length !== computedBuffer.length) {
    return { valid: false, timestamp }
  }

  const valid = timingSafeEqual(sigBuffer, computedBuffer)
  return { valid, timestamp }
}

/**
 * Optional: reject webhook if timestamp is too old (prevents replay attacks).
 * Default tolerance: 5 minutes.
 */
export function isTimestampFresh(
  timestamp: number,
  toleranceSeconds = 300
): boolean {
  const now = Math.floor(Date.now() / 1000)
  return Math.abs(now - timestamp) <= toleranceSeconds
}
