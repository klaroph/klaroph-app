import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  createPaymentIntent,
  createPaymentMethodQrph,
  attachPaymentMethodToIntent,
  retrievePaymentIntent,
  PayMongoError,
  PAYMONGO_MIN_AMOUNT_CENTAVOS,
  paymongoBelowMinimumMessage,
} from '@/lib/paymongo'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { shouldBlockNewProPurchase } from '@/lib/subscriptionStateCore'
import { getSubscriptionPricing, TESTER_PRICE_CENTAVOS } from '@/lib/getSubscriptionPricing'
import { buildCheckoutMetadata, resolveCheckoutGrant } from '@/lib/checkoutGrant'

const QRPH_EXPIRY_SECONDS = 600 // 10 minutes

/** Product text stored on the payment. QR Ph payment intents have no line_items field. */
const PRO_DESCRIPTION =
  'KlaroPH Pro. One-time purchase of ₱999. Pay once. No subscription.'

/**
 * Statement text for card and GCash. PayMongo accepts letters, numbers, spaces,
 * and limited punctuation, so the peso sign is written as P.
 */
const PRO_STATEMENT_DESCRIPTOR = 'KlaroPH Pro P999 once'

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sub = await resolveSubscriptionState(user.id)
    if (shouldBlockNewProPurchase(sub)) {
      return NextResponse.json(
        { error: 'You already have KlaroPH Pro.' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const existingPaymentIntentId = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id.trim() : null

    const billing = {
      name: user.user_metadata?.full_name ?? user.email ?? 'Customer',
      email: user.email ?? '',
    }
    const pricing = await getSubscriptionPricing(user.id)

    if (existingPaymentIntentId) {
      const existing = await retrievePaymentIntent(existingPaymentIntentId)
      const metadata = (existing.data.attributes.metadata ?? {}) as Record<string, string>
      if (metadata.user_id !== user.id) {
        return NextResponse.json({ error: 'Invalid payment intent.' }, { status: 403 })
      }
      // Annual intents were also 99900. Regenerate only a lifetime grant at today's server price
      // (99900, or 500 when profiles.user_type is tester).
      if (metadata.grant !== 'lifetime' || existing.data.attributes.amount !== pricing.amountCentavos) {
        return NextResponse.json(
          { error: 'This payment is no longer available.' },
          { status: 410 }
        )
      }
      if (existing.data.attributes.status === 'succeeded') {
        return NextResponse.json({ error: 'Payment already completed.' }, { status: 400 })
      }

      const pm = await createPaymentMethodQrph({
        billing,
        expiry_seconds: QRPH_EXPIRY_SECONDS,
      })
      const attached = await attachPaymentMethodToIntent(existingPaymentIntentId, pm.data.id)
      const nextAction = attached.data.attributes.next_action
      const imageUrl = nextAction?.code?.image_url
      if (!imageUrl) {
        return NextResponse.json(
          { error: 'Failed to generate new QR code.' },
          { status: 502 }
        )
      }
      const expiresAtEpoch = Math.floor(Date.now() / 1000) + QRPH_EXPIRY_SECONDS
      return NextResponse.json({
        payment_intent_id: existingPaymentIntentId,
        image_url: imageUrl,
        expires_at_epoch: expiresAtEpoch,
      })
    }

    const { amountCentavos } = resolveCheckoutGrant(pricing.amountCentavos)
    if (amountCentavos <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than zero.' },
        { status: 400 }
      )
    }
    if (amountCentavos !== TESTER_PRICE_CENTAVOS && amountCentavos < PAYMONGO_MIN_AMOUNT_CENTAVOS) {
      return NextResponse.json(
        {
          error: paymongoBelowMinimumMessage(amountCentavos, pricing.isTesterPricing, 'qrph', {
            baseCentavos: amountCentavos,
          }),
        },
        { status: 400 }
      )
    }

    const intent = await createPaymentIntent({
      amount: amountCentavos,
      currency: 'PHP',
      paymentMethodAllowed: ['qrph'],
      description: PRO_DESCRIPTION,
      statementDescriptor: PRO_STATEMENT_DESCRIPTOR,
      metadata: buildCheckoutMetadata({
        userId: user.id,
        expectedAmountCentavos: amountCentavos,
      }),
    })

    const pm = await createPaymentMethodQrph({
      billing,
      expiry_seconds: QRPH_EXPIRY_SECONDS,
    })

    const attached = await attachPaymentMethodToIntent(intent.data.id, pm.data.id)
    const nextAction = attached.data.attributes.next_action
    const imageUrl = nextAction?.code?.image_url
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Failed to generate QR code.' },
        { status: 502 }
      )
    }

    const expiresAtEpoch = Math.floor(Date.now() / 1000) + QRPH_EXPIRY_SECONDS
    return NextResponse.json({
      payment_intent_id: intent.data.id,
      image_url: imageUrl,
      expires_at_epoch: expiresAtEpoch,
    })
  } catch (err) {
    if (err instanceof PayMongoError) {
      console.error('[PayMongo] create-qrph error:', err.message, err.body)
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      )
    }
    console.error('[PayMongo] create-qrph unexpected:', err)
    return NextResponse.json(
      { error: 'Failed to create QR payment.' },
      { status: 500 }
    )
  }
}
