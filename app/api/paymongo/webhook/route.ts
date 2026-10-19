/**
 * PayMongo webhook handler.
 * Required event subscriptions in PayMongo Dashboard:
 * - checkout_session.payment.paid (redirect checkout)
 * - payment.paid (QRPH / payment intent flow) — see https://developers.paymongo.com/docs/qr-ph-api
 * - payment.failed (founder payment-failed alert only; no access changes)
 *
 * subscription.* and invoice.* events are acknowledged and stored on payment_events.
 * They do not change subscription rows.
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { retrieveCheckoutSession, retrievePaymentIntent } from '@/lib/paymongo'
import { authorizePaymongoWebhook } from '@/lib/paymongoWebhookSecurity'
import { runClaimedWebhookHandler } from '@/lib/paymentEventIdempotency'
import { sendPremiumConfirmationIfNew } from '@/lib/premiumConfirmationEmail'
import { tryIncrementVoucherUsedCountFromMetadata } from '@/lib/voucherWebhookIncrement'
import { verifyPaidGrant, type CheckoutGrant } from '@/lib/checkoutGrant'
import { extractPaidAmount } from '@/lib/email/proEmails'
import { notifyFounderOfPayment } from '@/lib/founder/alertsServer'

type WebhookEvent = {
  data: {
    id: string
    type: string
    attributes: {
      type: string
      livemode: boolean
      data: {
        id: string
        type: string
        attributes: Record<string, unknown>
      }
      previous_data: Record<string, unknown>
      created_at: number
      updated_at: number
    }
  }
}

export async function POST(request: Request) {
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const auth = authorizePaymongoWebhook({
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    rawBody,
    signatureHeader: request.headers.get('paymongo-signature') ?? '',
  })
  if (!auth.ok) {
    if (auth.status === 500) {
      console.error('[Webhook] PAYMONGO_WEBHOOK_SECRET is not set')
    } else {
      console.warn('[Webhook] Rejected', auth.error)
    }
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let event: WebhookEvent
  try {
    event = JSON.parse(rawBody) as WebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = event.data?.id
  const eventType = event.data?.attributes?.type
  if (!eventId || !eventType) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }

  console.log('[Webhook] Processing event_id=', eventId, 'type=', eventType)

  try {
    const result = await runClaimedWebhookHandler({
      claim: async () => {
        const { error: insertError } = await supabaseAdmin.from('payment_events').insert({
          event_id: eventId,
          event_type: eventType,
          payload: event,
        })
        if (!insertError) return 'claimed'
        if (insertError.code === '23505') return 'duplicate'
        throw new Error(insertError.message)
      },
      release: async () => {
        await supabaseAdmin.from('payment_events').delete().eq('event_id', eventId)
      },
      handle: async () => {
        switch (eventType) {
          case 'checkout_session.payment.paid':
            await handleCheckoutPaid(event)
            break

          case 'subscription.activated':
          case 'subscription.updated':
          case 'subscription.past_due':
          case 'subscription.unpaid':
          case 'subscription.invoice.paid':
          case 'subscription.invoice.payment_failed':
          case 'invoice.payment_failed':
            acknowledgeDeadSubscriptionEvent(event)
            break

          case 'payment.paid':
            await handlePaymentPaid(event)
            break

          case 'payment.failed':
            await handlePaymentFailed(event)
            break

          default:
            console.log('[Webhook] Unhandled event type=', eventType, 'event_id=', eventId)
        }
      },
    })

    if (result.outcome === 'already_processed') {
      console.log('[Webhook] Idempotent skip event_id=', eventId, 'type=', eventType)
      return NextResponse.json({ status: 'already_processed' })
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[Webhook] Handler error event_id=', eventId, 'type=', eventType, err)
    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    )
  }
}

function acknowledgeDeadSubscriptionEvent(event: WebhookEvent) {
  console.log(
    '[Webhook] Acknowledged unused subscription/invoice event type=',
    event.data.attributes.type,
    'event_id=',
    event.data.id
  )
}

function paidCentavosOf(payload: unknown): number | null {
  const amount = extractPaidAmount(payload)
  if (!amount || amount.currency.toUpperCase() !== 'PHP') return null
  if (!Number.isInteger(amount.centavos) || amount.centavos <= 0) return null
  return amount.centavos
}

function paidCentavosFromAttributes(attributes: Record<string, unknown> | undefined): number | null {
  if (!attributes) return null
  return paidCentavosOf({
    data: { attributes: { data: { attributes } } },
  })
}

function withholdGrant(event: WebhookEvent, reason: string) {
  console.warn(
    '[Webhook] Grant withheld type=',
    event.data.attributes.type,
    'event_id=',
    event.data.id,
    'reason=',
    reason
  )
}

async function alertFounderOfPaid(event: WebhookEvent, userId: string | null, planLabel: string | null) {
  try {
    await notifyFounderOfPayment({
      kind: 'paid',
      eventId: event.data.id,
      livemode: event.data.attributes.livemode === true,
      userId,
      planLabel,
      amount: extractPaidAmount(event),
      reason: null,
      occurredAt: eventTime(event),
    })
  } catch {
    // Founder alert failure must never block payment fulfillment
  }
}

function planLabelFor(grant: CheckoutGrant): string {
  switch (grant) {
    case 'lifetime':
      return 'Lifetime'
    case 'annual':
      return 'Annual'
    case 'monthly':
      return 'Monthly'
    default: {
      const unexpected: never = grant
      return unexpected
    }
  }
}

async function existingRowIsLifetime(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('is_lifetime')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[Webhook] subscription lookup failed')
    throw error
  }
  return (data as { is_lifetime?: boolean | null } | null)?.is_lifetime === true
}

/**
 * Grant Pro only when the PayMongo paid amount equals the server-expected amount
 * for the server-set grant. A mismatch or bad metadata grants nothing and stays
 * claimed so PayMongo does not retry.
 */
async function fulfillPaidPro(params: {
  event: WebhookEvent
  userId: string
  metadata: Record<string, string>
  paidCentavos: number | null
  checkoutSessionId: string | null
  notifyOnSuccess: boolean
}) {
  const decision = verifyPaidGrant(params.metadata, params.paidCentavos)
  if (!decision.ok) {
    withholdGrant(params.event, decision.reason)
    await alertFounderOfPaid(params.event, params.userId, null)
    return
  }

  const isLifetimeGrant = decision.grant === 'lifetime'
  if ((await existingRowIsLifetime(params.userId)) && !isLifetimeGrant) {
    console.log(
      '[Webhook] Lifetime row preserved type=',
      params.event.data.attributes.type,
      'event_id=',
      params.event.data.id
    )
    await alertFounderOfPaid(params.event, params.userId, 'Lifetime')
    return
  }

  const { data: premiumPlan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('name', 'pro')
    .single()

  if (!premiumPlan) {
    console.error('[Webhook] Subscription assignment failed: plan (pro) not found')
    throw new Error('Premium plan not found')
  }

  const now = new Date()
  const periodEnd = new Date(now)
  if (decision.planType === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: params.userId,
        plan_id: premiumPlan.id,
        status: 'active',
        plan_type: decision.planType,
        payment_provider: 'paymongo',
        paymongo_checkout_session_id: params.checkoutSessionId,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_until: null,
        grace_period_used: false,
        auto_renew: !isLifetimeGrant,
        is_lifetime: isLifetimeGrant,
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('[Webhook] Subscription assignment failed event_id=', params.event.data.id, 'code=', error.code)
    throw error
  }

  console.log(
    '[Webhook] Subscription upsert success event_id=',
    params.event.data.id,
    'grant=',
    decision.grant,
    'plan_type=',
    decision.planType
  )

  await tryIncrementVoucherUsedCountFromMetadata(params.metadata)

  try {
    await sendPremiumConfirmationIfNew(params.event.data.id, params.userId, decision.planType)
  } catch {
    // Email failure must never block payment fulfillment
  }

  if (params.notifyOnSuccess) {
    await alertFounderOfPaid(params.event, params.userId, planLabelFor(decision.grant))
  }
}

async function handleCheckoutPaid(event: WebhookEvent) {
  const sessionData = event.data.attributes.data
  const checkoutSessionId = sessionData.id
  const attrs = sessionData.attributes
  let metadata = (attrs.metadata ?? {}) as Record<string, string>
  let sessionAttributes: Record<string, unknown> | undefined
  let userId = metadata.user_id

  let paidCentavos = paidCentavosOf(event)
  console.log(
    '[Webhook] handleCheckoutPaid session_id=',
    checkoutSessionId,
    'metadata_from_payload=',
    !!attrs.metadata
  )

  // Payload metadata is often omitted. Amount can be omitted too; the session is the
  // server-stored source for both.
  if (!userId || paidCentavos == null) {
    try {
      const session = await retrieveCheckoutSession(checkoutSessionId)
      sessionAttributes = session.data.attributes as Record<string, unknown>
      const apiMetadata = (session.data.attributes.metadata ?? {}) as Record<string, string>
      if (apiMetadata.user_id) {
        userId = apiMetadata.user_id
        metadata = apiMetadata
      }
      if (paidCentavos == null) paidCentavos = paidCentavosFromAttributes(sessionAttributes)
      console.log('[Webhook] After fetch session metadata_present=', Boolean(userId))
    } catch (err) {
      console.error('[Webhook] Failed to fetch checkout session:', err)
      throw err
    }
  }

  if (!userId || metadata.plan !== 'pro') {
    withholdGrant(event, 'missing_metadata')
    await alertFounderOfPaid(event, userId || null, null)
    return
  }

  await fulfillPaidPro({
    event,
    userId,
    metadata,
    paidCentavos,
    checkoutSessionId,
    notifyOnSuccess: false,
  })
}

/**
 * payment.paid: QRPH (payment intent) flow — activate subscription from intent metadata.
 * PayMongo docs: https://developers.paymongo.com/docs/qr-ph-api (webhook subscribed to payment.paid).
 */
async function handlePaymentPaid(event: WebhookEvent) {
  const paymentData = event.data.attributes.data
  if (paymentData.type !== 'payment') {
    console.log('[Webhook] payment.paid ignored: data.type=', (paymentData as { type?: string }).type)
    return
  }
  const paymentAttrs = paymentData.attributes as Record<string, unknown>
  const paymentIntentId = paymentAttrs.payment_intent_id as string | undefined
  if (!paymentIntentId) {
    console.error('[Webhook] payment.paid missing payment_intent_id — payload may be unexpected; not marking processed so PayMongo can retry')
    throw new Error('payment.paid missing payment_intent_id')
  }

  console.log('[Webhook] payment.paid received payment_intent_id=', paymentIntentId)
  let metadata: Record<string, string> = {}
  try {
    const intent = await retrievePaymentIntent(paymentIntentId)
    metadata = (intent.data.attributes.metadata ?? {}) as Record<string, string>
    console.log('[Webhook] payment.paid intent metadata_present=', Boolean(metadata.user_id && metadata.plan))
  } catch (err) {
    console.error('[Webhook] Failed to fetch payment intent for payment.paid:', err)
    throw err
  }

  const userId = metadata.user_id
  if (!userId || metadata.plan !== 'pro') {
    console.log('[Webhook] payment.paid skipped: no user_id or plan in intent metadata (not a KlaroPH Pro QR payment)')
    return
  }

  await fulfillPaidPro({
    event,
    userId,
    metadata,
    paidCentavos: paidCentavosOf(event),
    checkoutSessionId: null,
    notifyOnSuccess: true,
  })
}

/**
 * payment.failed: no access changes. Alerts the founder using the payment's own metadata —
 * the same attribution the Founder Dock uses for failed-payment counts.
 */
async function handlePaymentFailed(event: WebhookEvent) {
  const paymentData = event.data.attributes.data
  console.warn('[Webhook] payment.failed event_id=', event.data.id)
  if (paymentData.type !== 'payment') return

  const attrs = paymentData.attributes
  const metadata = (attrs.metadata ?? {}) as Record<string, string>
  const planType = metadata.plan === 'pro' ? metadata.plan_type : undefined

  try {
    await notifyFounderOfPayment({
      kind: 'failed',
      eventId: event.data.id,
      livemode: event.data.attributes.livemode === true,
      userId: metadata.user_id ?? null,
      planLabel: planType === 'annual' ? 'Annual' : planType === 'monthly' ? 'Monthly' : null,
      amount: extractPaidAmount(event),
      reason: (attrs.failed_message ?? attrs.failed_code ?? null) as string | null,
      occurredAt: eventTime(event),
    })
  } catch {
    // Founder alert failure must never fail webhook processing
  }
}

function eventTime(event: WebhookEvent): string {
  const seconds = event.data.attributes.created_at
  return new Date(Number.isFinite(seconds) ? seconds * 1000 : Date.now()).toISOString()
}
