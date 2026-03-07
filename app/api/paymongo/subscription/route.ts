import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * GET — Retrieve current user's subscription details.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('id, status, payment_provider, current_period_start, current_period_end, plan_id, plans(name)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!sub) {
      return NextResponse.json({ subscription: null })
    }

    return NextResponse.json({
      subscription: {
        id: sub.id,
        status: sub.status,
        plan_name: (sub as { plans?: { name?: string } }).plans?.name ?? 'free',
        payment_provider: sub.payment_provider,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
      },
    })
  } catch (err) {
    console.error('GET /api/paymongo/subscription', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

/**
 * DELETE — Cancel subscription at period end (turn off auto-renew; access until current_period_end).
 * Does not downgrade immediately. Downgrade happens when current_period_end passes (cron or get_user_features).
 */
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ auto_renew: false })
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/paymongo/subscription', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      status: 'canceled',
      message: 'Your subscription will remain active until the end of the current billing period.',
    })
  } catch (err) {
    console.error('DELETE /api/paymongo/subscription', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
