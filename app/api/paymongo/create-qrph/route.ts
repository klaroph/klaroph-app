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
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSubscriptionPricing } from '@/lib/getSubscriptionPricing'
import { applyPromoToCentavos } from '@/lib/checkoutPromo'
import { parsePromoCodeFromBody, resolveVoucherForCheckout } from '@/lib/voucherForCheckout'

const QRPH_EXPIRY_SECONDS = 600 // 10 minutes

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
    if (sub.state === 'ACTIVE' && sub.planId) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('name')
        .eq('id', sub.planId)
        .single()
      const planName = (plan as { name?: string } | null)?.name ?? null
      if (planName === 'pro' && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()) {
        return NextResponse.json(
          { error: 'User already has active subscription.' },
          { status: 400 }
        )
      }
    }

    const body = await request.json().catch(() => ({}))
    const existingPaymentIntentId = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id.trim() : null
    const plan_type = body?.plan_type === 'annual' ? 'annual' : 'monthly'

    const billing = {
      name: user.user_metadata?.full_name ?? user.email ?? 'Customer',
      email: user.email ?? '',
    }

    if (existingPaymentIntentId) {
      // Generate new QR for existing payment intent (after expiry)
      const existing = await retrievePaymentIntent(existingPaymentIntentId)
      const metadata = (existing.data.attributes.metadata ?? {}) as Record<string, string>
      if (metadata.user_id !== user.id) {
        return NextResponse.json({ error: 'Invalid payment intent.' }, { status: 403 })
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

    // New QRPH session: create intent + method + attach (pricing from DB profile.user_type only)
    const promoCodeParam = parsePromoCodeFromBody(body?.promoCode)
    const resolved = await resolveVoucherForCheckout(promoCodeParam)
    const promo = resolved?.promo ?? null
    const appliedPromo = resolved?.applied ?? null

    const pricing = await getSubscriptionPricing(user.id)
    const baseCentavos = plan_type === 'annual' ? pricing.annualCentavos : pricing.monthlyCentavos
    console.log('[CheckoutPromo] paymongo/create-qrph route', {
      plan_type,
      baseCentavos,
      baseCentavosSource: plan_type === 'annual' ? 'annualCentavos' : 'monthlyCentavos',
      monthlyCentavos: pricing.monthlyCentavos,
      annualCentavos: pricing.annualCentavos,
    })
    const amountCentavos = applyPromoToCentavos(baseCentavos, promo, 'paymongo/create-qrph')
    if (amountCentavos <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than zero.' },
        { status: 400 }
      )
    }
    if (amountCentavos < PAYMONGO_MIN_AMOUNT_CENTAVOS) {
      return NextResponse.json(
        {
          error: paymongoBelowMinimumMessage(
            amountCentavos,
            pricing.isTesterPricing,
            'qrph',
            { baseCentavos }
          ),
        },
        { status: 400 }
      )
    }
    const intent = await createPaymentIntent({
      amount: amountCentavos,
      currency: 'PHP',
      paymentMethodAllowed: ['qrph'],
      description: plan_type === 'annual'
        ? 'KlaroPH Pro Annual: 20 goals, unlimited history, import/export, advance charts and analytics.'
        : 'KlaroPH Pro Monthly: 20 goals, unlimited history, import/export, advance charts and analytics.',
      metadata: {
        user_id: String(user.id),
        plan: 'pro',
        plan_type,
        promoCode: promoCodeParam ?? '',
      },
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
      ...(appliedPromo ? { appliedPromo } : {}),
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
