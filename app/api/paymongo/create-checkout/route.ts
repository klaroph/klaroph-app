import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { createCheckoutSession, PayMongoError } from '@/lib/paymongo'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MONTHLY_CENTAVOS = Number(process.env.CLARITY_PREMIUM_MONTHLY_CENTAVOS) || 14900 // ₱149
const ANNUAL_DISCOUNT = 0.8 // 20% off
const ANNUAL_CENTAVOS = Math.round(12 * MONTHLY_CENTAVOS * ANNUAL_DISCOUNT)

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
    // Block checkout only when: active + plan is Pro + period still valid. Free plan can upgrade.
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

    let plan_type: PlanTypeCheckout = 'monthly'
    try {
      const body = await request.json().catch(() => ({}))
      if (body?.plan_type === 'annual') plan_type = 'annual'
    } catch {
      // default monthly
    }

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

    const isAnnual = plan_type === 'annual'
    const amount = isAnnual ? ANNUAL_CENTAVOS : MONTHLY_CENTAVOS
    const planNameLabel = isAnnual ? 'Clarity Premium — Annual (Save 20%)' : 'Clarity Premium — Monthly'
    const description = isAnnual
      ? 'KlaroPH Clarity Premium: 12 months, unlimited goals, insights, export, analytics.'
      : 'KlaroPH Clarity Premium: 20 goals, simulator, scenarios, smart insights, export, analytics.'

    const metadata: Record<string, string> = {
      user_id: String(user.id),
      plan: 'pro',
      plan_type,
    }
    console.log('[Checkout] Creating session user_id=', user.id, 'plan=pro plan_type=', plan_type)

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
