import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  verifyWebhookSignature,
  isTimestampFresh,
  retrieveCheckoutSession,
} from '@/lib/paymongo'

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
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Webhook] PAYMONGO_WEBHOOK_SECRET is not set')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    )
  }
  console.log('[Webhook] secret fingerprint = len:' + webhookSecret.length + ' first:' + webhookSecret.slice(0, 4) + ' last:' + webhookSecret.slice(-4))

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // -----------------------------------------------------------------------
  // 1. Verify signature
  // -----------------------------------------------------------------------
  const sigHeader = request.headers.get('paymongo-signature') ?? ''
  // Diagnostic (remove after debugging): raw body length + header prefix for Vercel logs
  console.log('[Webhook] diagnostic rawBody.length=', rawBody.length, 'sigHeaderPrefix=', sigHeader.slice(0, 50))
  if (!sigHeader) {
    console.warn('[Webhook] Missing Paymongo-Signature header')
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 401 }
    )
  }

  const { valid, timestamp } = verifyWebhookSignature(
    rawBody,
    sigHeader,
    webhookSecret
  )

  if (!valid) {
    console.warn('[Webhook] Invalid signature — decision=401', 'timestamp=', timestamp, 'rawBody.length=', rawBody.length)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    )
  }

  if (!isTimestampFresh(timestamp)) {
    console.warn('[Webhook] Stale timestamp:', timestamp)
    return NextResponse.json(
      { error: 'Stale webhook' },
      { status: 401 }
    )
  }

  // -----------------------------------------------------------------------
  // 2. Parse event
  // -----------------------------------------------------------------------
  let event: WebhookEvent
  try {
    event = JSON.parse(rawBody) as WebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = event.data.id
  const eventType = event.data.attributes.type

  // -----------------------------------------------------------------------
  // 3. Idempotency: skip if already successfully processed (row exists).
  // -----------------------------------------------------------------------
  const { data: existing } = await supabaseAdmin
    .from('payment_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing) {
    console.log('[Webhook] Idempotent skip event_id=', eventId, 'type=', eventType)
    return NextResponse.json({ status: 'already_processed' })
  }

  console.log('[Webhook] Processing event_id=', eventId, 'type=', eventType)
  // Temporary audit: confirm event type and payload shape
  const attrs = event?.data?.attributes
  console.log('[Webhook] event.data.attributes.type=', attrs?.type, 'data.type=', (attrs?.data as { type?: string })?.type)

  // -----------------------------------------------------------------------
  // 4. Route to handler. Insert payment_events only after success so failed
  //    events are not marked processed and PayMongo retries can run handler again.
  // -----------------------------------------------------------------------
  try {
    switch (eventType) {
      case 'checkout_session.payment.paid':
        await handleCheckoutPaid(event)
        break

      case 'subscription.activated':
        await handleSubscriptionActivated(event)
        break

      case 'subscription.updated':
        await handleSubscriptionUpdated(event)
        break

      case 'subscription.past_due':
      case 'subscription.unpaid':
        await handleSubscriptionProblem(event)
        break

      case 'subscription.invoice.paid':
        await handleInvoicePaid(event)
        break

      case 'subscription.invoice.payment_failed':
        await handleInvoiceFailed(event)
        break

      case 'payment.paid':
        console.log('[Webhook] payment.paid (no-op for checkout flow) event_id=', eventId)
        break

      case 'payment.failed':
        console.warn('[Webhook] payment.failed event_id=', eventId)
        break

      default:
        console.log('[Webhook] Unhandled event type=', eventType, 'event_id=', eventId)
    }

    // Mark event as processed only after successful handler completion.
    const { error: insertError } = await supabaseAdmin.from('payment_events').insert({
      event_id: eventId,
      event_type: eventType,
      payload: event,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        // Race: another request processed and inserted first; we still succeeded.
        console.log('[Webhook] payment_events insert race (already present) event_id=', eventId)
      } else {
        console.error('[Webhook] payment_events insert failed after handler success:', insertError.code, insertError.message)
        return NextResponse.json(
          { error: 'Processing failed' },
          { status: 500 }
        )
      }
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

// ==========================================================================
// Event Handlers
// ==========================================================================

async function handleCheckoutPaid(event: WebhookEvent) {
  const sessionData = event.data.attributes.data
  const checkoutSessionId = sessionData.id
  const attrs = sessionData.attributes
  let metadata = (attrs.metadata ?? {}) as Record<string, string>
  let userId = metadata.user_id

  console.log('[Webhook] handleCheckoutPaid session_id=', checkoutSessionId, 'data.type=', (sessionData as { type?: string }).type, 'metadata_from_payload=', !!attrs.metadata, 'user_id_from_payload=', userId ?? '(none)')

  // Webhook payload does not include metadata; fetch session from PayMongo API
  if (!userId) {
    try {
      const session = await retrieveCheckoutSession(checkoutSessionId)
      const apiMetadata = (session.data.attributes.metadata ?? {}) as Record<string, string>
      userId = apiMetadata.user_id
      metadata = apiMetadata
      console.log('[Webhook] After fetch session: user_id=', userId ?? '(none)', 'metadata_keys=', Object.keys(apiMetadata).join(','))
    } catch (err) {
      console.error('[Webhook] Failed to fetch checkout session:', err)
      throw err
    }
  }

  if (!userId) {
    console.error('[Webhook] Checkout session metadata missing after fetch session_id=', checkoutSessionId)
    console.log('[Webhook] Checkout session metadata missing after fetch — throwing error')
    throw new Error('Checkout session metadata missing: user_id')
  }

  const planType = (metadata.plan_type === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual'
  console.log('[Webhook] Subscription insert attempt user_id=', userId, 'plan_type=', planType)

  // Assign single premium plan (pro) only.
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
  if (planType === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan_id: premiumPlan.id,
        status: 'active',
        plan_type: planType,
        payment_provider: 'paymongo',
        paymongo_checkout_session_id: checkoutSessionId,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_until: null,
        grace_period_used: false,
        auto_renew: true,
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('[Webhook] Subscription assignment failed user_id=', userId, 'session_id=', checkoutSessionId, 'error=', error.message, 'code=', error.code)
    throw error
  }

  console.log('[Webhook] Subscription insert/update result: success user_id=', userId, 'plan=pro plan_type=', planType, 'period_end=', periodEnd.toISOString())
}

async function handleSubscriptionActivated(event: WebhookEvent) {
  const subData = event.data.attributes.data
  const attrs = subData.attributes
  const subscriptionId = subData.id
  const customerId = attrs.customer_id as string

  const { data: premiumPlan } = await supabaseAdmin.from('plans').select('id').eq('name', 'pro').single()
  if (!premiumPlan) {
    console.error('[Webhook] subscription.activated: plan (pro) not found')
    throw new Error('Premium plan not found')
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      paymongo_subscription_id: subscriptionId,
      paymongo_customer_id: customerId,
      plan_id: premiumPlan.id,
      grace_period_until: null,
      grace_period_used: false,
      auto_renew: true,
    })
    .eq('paymongo_customer_id', customerId)

  if (error) {
    console.error('[Webhook] subscription.activated update failed subscription_id=', subscriptionId, 'error=', error.message)
    throw error
  }

  console.log('[Webhook] Subscription activated subscription_id=', subscriptionId, 'plan=pro')
}

async function handleSubscriptionUpdated(event: WebhookEvent) {
  const subData = event.data.attributes.data
  const attrs = subData.attributes
  const subscriptionId = subData.id
  const status = attrs.status as string

  const updates: Record<string, unknown> = {}
  if (status === 'cancelled' || status === 'incomplete_cancelled') {
    updates.auto_renew = false
    // Do not set status: keep 'active' so user retains access until current_period_end
    console.log('[Webhook] Subscription cancelled (access until period end) subscription_id=', subscriptionId)
  } else {
    const dbStatus = status === 'incomplete_cancelled' ? 'canceled' : status === 'cancelled' ? 'canceled' : status
    updates.status = dbStatus
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updates)
    .eq('paymongo_subscription_id', subscriptionId)

  if (error) {
    console.error('[Webhook] subscription.updated failed subscription_id=', subscriptionId, 'error=', error.message)
    throw error
  }

  console.log('[Webhook] Subscription updated subscription_id=', subscriptionId, 'updates=', Object.keys(updates).join(','))
}

async function handleSubscriptionProblem(event: WebhookEvent) {
  const subData = event.data.attributes.data
  const subscriptionId = subData.id

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, grace_period_used')
    .eq('paymongo_subscription_id', subscriptionId)
    .single()

  const newStatus = 'past_due'
  const updates: Record<string, unknown> = { status: newStatus }

  if (sub?.status === 'active' && sub?.grace_period_used === false) {
    const graceEnd = new Date()
    graceEnd.setDate(graceEnd.getDate() + 3)
    updates.grace_period_until = graceEnd.toISOString()
    updates.grace_period_used = true
    console.log('[Webhook] Grace period started subscription_id=', subscriptionId, 'until=', graceEnd.toISOString())
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updates)
    .eq('paymongo_subscription_id', subscriptionId)

  if (error) {
    console.error('[Webhook] subscription problem update failed subscription_id=', subscriptionId, 'error=', error.message)
    throw error
  }

  console.log('[Webhook] Subscription marked past_due subscription_id=', subscriptionId, 'grace=', !!updates.grace_period_until)
}

async function handleInvoicePaid(event: WebhookEvent) {
  const invoiceData = event.data.attributes.data
  const attrs = invoiceData.attributes
  const subscriptionId = attrs.resource_id as string

  if (!subscriptionId) return

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      grace_period_until: null,
      grace_period_used: false,
      auto_renew: true,
    })
    .eq('paymongo_subscription_id', subscriptionId)

  if (error) {
    console.error('[Webhook] invoice.paid update failed subscription_id=', subscriptionId, 'error=', error.message)
    throw error
  }

  console.log('[Webhook] Subscription renewed via invoice subscription_id=', subscriptionId)
}

async function handleInvoiceFailed(event: WebhookEvent) {
  const invoiceData = event.data.attributes.data
  const attrs = invoiceData.attributes
  const subscriptionId = attrs.resource_id as string

  if (!subscriptionId) return

  console.warn('[Webhook] Invoice payment failed subscription_id=', subscriptionId)

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, grace_period_used')
    .eq('paymongo_subscription_id', subscriptionId)
    .single()

  const updates: Record<string, unknown> = { status: 'past_due' }
  if (sub?.status === 'active' && sub?.grace_period_used === false) {
    const graceEnd = new Date()
    graceEnd.setDate(graceEnd.getDate() + 3)
    updates.grace_period_until = graceEnd.toISOString()
    updates.grace_period_used = true
    console.log('[Webhook] Grace period started subscription_id=', subscriptionId)
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updates)
    .eq('paymongo_subscription_id', subscriptionId)

  if (error) {
    console.error('[Webhook] invoice.payment_failed update failed subscription_id=', subscriptionId, 'error=', error.message)
  }
}
