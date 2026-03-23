import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  createCheckoutSession,
  PayMongoError,
  PAYMONGO_MIN_AMOUNT_CENTAVOS,
  paymongoBelowMinimumMessage,
} from '@/lib/paymongo'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSubscriptionPricing } from '@/lib/getSubscriptionPricing'
import { applyPromoToCentavos } from '@/lib/checkoutPromo'
import { parsePromoCodeFromBody, resolveVoucherForCheckout } from '@/lib/voucherForCheckout'

export type PlanTypeCheckout = 'monthly' | 'annual'

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
    console.log('[Checkout Guard] sub.state=', sub.state, '| sub.planId=', sub.planId, '| currentPeriodEnd=', sub.currentPeriodEnd?.toISOString() ?? null)
    let planName: string | null = null
    if (sub.state === 'ACTIVE' && sub.planId) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('name')
        .eq('id', sub.planId)
        .single()
      planName = (plan as { name?: string } | null)?.name ?? null
      console.log('[Checkout Guard] planName (from plans)=', planName)
      if (planName === 'pro' && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()) {
        console.log('[Checkout Guard] decision=block')
        return NextResponse.json(
          { error: 'User already has active subscription.' },
          { status: 400 }
        )
      }
    }

    const body = await request.json().catch(() => ({}))
    const planTypeRaw = body?.planType ?? body?.plan_type
    let plan_type: PlanTypeCheckout = 'monthly'
    if (planTypeRaw === 'annual') plan_type = 'annual'

    const promoCodeParam = parsePromoCodeFromBody(body?.promoCode)
    const resolved = await resolveVoucherForCheckout(promoCodeParam)
    const promo = resolved?.promo ?? null
    const appliedPromo = resolved?.applied ?? null

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
      console.error('[PayMongo] NEXT_PUBLIC_APP_URL is not set')
      return NextResponse.json(
        { error: 'App URL not configured. Set NEXT_PUBLIC_APP_URL.' },
        { status: 500 }
      )
    }
    const success_url = `${baseUrl.trim().replace(/\/$/, '')}/dashboard/upgrade-success`
    const cancel_url = `${baseUrl.trim().replace(/\/$/, '')}/dashboard`
    console.log('PayMongo success_url:', success_url)

    const pricing = await getSubscriptionPricing(user.id)
    const isAnnual = plan_type === 'annual'
    const baseCentavos = isAnnual ? pricing.annualCentavos : pricing.monthlyCentavos
    console.log('[CheckoutPromo] payments/create-checkout route', {
      plan_type,
      baseCentavos,
      baseCentavosSource: isAnnual ? 'annualCentavos' : 'monthlyCentavos',
      monthlyCentavos: pricing.monthlyCentavos,
      annualCentavos: pricing.annualCentavos,
    })
    const amount = applyPromoToCentavos(baseCentavos, promo, 'payments/create-checkout')

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Checkout amount must be greater than zero.' },
        { status: 400 }
      )
    }
    if (amount < PAYMONGO_MIN_AMOUNT_CENTAVOS) {
      return NextResponse.json(
        {
          error: paymongoBelowMinimumMessage(
            amount,
            pricing.isTesterPricing,
            'checkout_session'
          ),
        },
        { status: 400 }
      )
    }

    const planNameLabel = isAnnual ? 'Clarity Pro — Annual (Save 20%)' : 'Clarity Pro — Monthly'
    const description = isAnnual
      ? 'KlaroPH Pro: 12 months, 20 goals, unlimited history, import/export, advance charts and analytics.'
      : 'KlaroPH Pro: 20 goals, unlimited history, import/export, advance charts and analytics.'

    const metadata: Record<string, string> = {
      user_id: String(user.id),
      plan: 'pro',
      plan_type,
      promoCode: promoCodeParam ?? '',
    }

    console.log('[Checkout Guard] decision=allow')
    console.log(
      '[Checkout] Creating session user_id=',
      user.id,
      'plan=pro plan_type=',
      plan_type,
      'amount_centavos=',
      amount,
      appliedPromo ? `(promo ${appliedPromo.code})` : ''
    )

    const session = await createCheckoutSession({
      lineItems: [
        {
          amount,
          currency: 'PHP',
          name: planNameLabel,
          quantity: 1,
          description,
        },
      ],
      description,
      successUrl: success_url,
      cancelUrl: cancel_url,
      billingEmail: user.email,
      billingName:
        user.user_metadata?.full_name ?? user.email ?? undefined,
      referenceNumber: `klaroph_${user.id.slice(0, 8)}_${Date.now()}`,
      metadata,
    })

    console.log('[Checkout] Success session_id=', session.data.id, 'user_id=', user.id)
    return NextResponse.json({
      checkout_url: session.data.attributes.checkout_url,
      session_id: session.data.id,
      ...(appliedPromo ? { appliedPromo } : {}),
    })
  } catch (err) {
    if (err instanceof PayMongoError) {
      console.error('[PayMongo] create-checkout error:', err.message, err.body)
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      )
    }
    console.error('[PayMongo] create-checkout unexpected:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 }
    )
  }
}
