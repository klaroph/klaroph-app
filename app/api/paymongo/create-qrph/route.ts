import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  createPaymentIntent,
  createPaymentMethodQrph,
  attachPaymentMethodToIntent,
  retrievePaymentIntent,
  PayMongoError,
} from '@/lib/paymongo'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MONTHLY_CENTAVOS = Number(process.env.CLARITY_PREMIUM_MONTHLY_CENTAVOS) || 14900
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

    // New QRPH session: create intent + method + attach
    const intent = await createPaymentIntent({
      amount: MONTHLY_CENTAVOS,
      currency: 'PHP',
      paymentMethodAllowed: ['qrph'],
      description: 'KlaroPH Pro: 20 goals, unlimited history, import/export, advance charts and analytics.',
      metadata: {
        user_id: String(user.id),
        plan: 'pro',
        plan_type: 'monthly',
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
