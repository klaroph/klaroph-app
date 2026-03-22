import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlan } from '@/lib/resolveUserPlan'

const GOAL_LIMIT_MESSAGE =
  "You've reached the Free limit. Explore KlaroPH Pro to unlock up to 20 goals."
const GRACE_MESSAGE =
  'Goal creation is paused while your payment is being updated. Please update your payment method.'

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const name =
      typeof body?.name === 'string' ? body.name.trim() : ''
    const targetAmount =
      typeof body?.target_amount === 'number'
        ? body.target_amount
        : Number(body?.target_amount)
    if (!name || Number.isNaN(targetAmount) || targetAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid name or target_amount.' },
        { status: 400 }
      )
    }

    const plan = await resolveUserPlan(user.id)

    if (!plan.can_create_goals) {
      return NextResponse.json(
        {
          error: plan.is_grace ? GRACE_MESSAGE : GOAL_LIMIT_MESSAGE,
          upgrade_required: !plan.is_grace,
        },
        { status: 403 }
      )
    }

    const { count, error: countError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (countError) {
      console.error('POST /api/goals count error:', countError.message)
      return NextResponse.json(
        { error: 'Could not verify goal count.' },
        { status: 500 }
      )
    }
    if ((count ?? 0) >= plan.max_goals) {
      return NextResponse.json(
        {
          error: GOAL_LIMIT_MESSAGE,
          upgrade_required: true,
        },
        { status: 403 }
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        name,
        target_amount: targetAmount,
        saved_amount: 0,
      })
      .select('id, name, target_amount, saved_amount, created_at')
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }
    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    console.error('POST /api/goals', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
