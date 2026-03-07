import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const VALID_FINANCIAL_STAGES = ['starter', 'stabilizing', 'building', 'scaling'] as const
const VALID_RISK_COMFORT = ['low', 'medium', 'high'] as const
const VALID_MOTIVATION = ['security', 'freedom', 'family', 'growth'] as const

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const monthly_income_range =
      typeof body?.monthly_income_range === 'string' ? body.monthly_income_range.trim() || null : null
    const monthly_income =
      typeof body?.monthly_income === 'number' && body.monthly_income >= 0 ? body.monthly_income : null
    const income_frequency =
      typeof body?.income_frequency === 'string' ? body.income_frequency.trim() || null : null
    const primary_goal_category =
      typeof body?.primary_goal_category === 'string' ? body.primary_goal_category.trim() || null : null
    const savings_confidence =
      typeof body?.savings_confidence === 'number' && body.savings_confidence >= 1 && body.savings_confidence <= 5
        ? body.savings_confidence
        : null
    const savings_percent =
      typeof body?.savings_percent === 'number' && body.savings_percent >= 0 && body.savings_percent <= 100
        ? body.savings_percent
        : null
    const financial_stage =
      typeof body?.financial_stage === 'string' && VALID_FINANCIAL_STAGES.includes(body.financial_stage as any)
        ? body.financial_stage
        : null
    const risk_comfort =
      typeof body?.risk_comfort === 'string' && VALID_RISK_COMFORT.includes(body.risk_comfort as any)
        ? body.risk_comfort
        : null
    const motivation_type =
      typeof body?.motivation_type === 'string' && VALID_MOTIVATION.includes(body.motivation_type as any)
        ? body.motivation_type
        : null
    const dream_statement =
      typeof body?.dream_statement === 'string' ? body.dream_statement.trim() || null : null
    const goal_name =
      typeof body?.goal_name === 'string' ? body.goal_name.trim() : ''
    const goal_target =
      typeof body?.goal_target_amount === 'number'
        ? body.goal_target_amount
        : Number(body?.goal_target_amount)

    if (!goal_name || Number.isNaN(goal_target) || goal_target <= 0) {
      return NextResponse.json(
        { error: 'Goal name and a valid target amount are required.' },
        { status: 400 }
      )
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        monthly_income_range,
        monthly_income,
        income_frequency,
        primary_goal_category,
        savings_confidence,
        savings_percent,
        financial_stage,
        risk_comfort,
        motivation_type,
        dream_statement,
        onboarding_completed: true,
        profile_completion_percentage: 100,
      })
      .eq('id', user.id)

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    const { error: goalError } = await supabaseAdmin.from('goals').insert({
      user_id: user.id,
      name: goal_name,
      target_amount: goal_target,
      saved_amount: 0,
    })

    if (goalError) {
      return NextResponse.json(
        { error: goalError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/onboarding/complete', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
