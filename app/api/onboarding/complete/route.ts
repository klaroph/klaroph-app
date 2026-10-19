import { NextResponse } from 'next/server'
import { plainDbError } from '@/lib/apiError'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { toLocalDateString } from '@/lib/format'
import { nicknameForWrite } from '@/lib/displayName'

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
    const bodyHas = (key: string) =>
      !!body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, key)
    // Only a non-empty string is written. A 4-step finish omits this, and a blank
    // string must not clear a range the person already saved on Profile.
    const monthly_income_range =
      typeof body?.monthly_income_range === 'string' ? body.monthly_income_range.trim() : ''
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

    // Pay-period amount the user typed. Never derived from monthly_income.
    const pay_period_income =
      typeof body?.pay_period_income === 'number' &&
      Number.isFinite(body.pay_period_income) &&
      body.pay_period_income > 0
        ? body.pay_period_income
        : null
    if (pay_period_income == null) {
      return NextResponse.json(
        { error: 'A valid pay-period income amount is required.' },
        { status: 400 }
      )
    }

    const parsedNickname = nicknameForWrite(body?.nickname)
    if (!parsedNickname.ok) {
      return NextResponse.json({ error: parsedNickname.error }, { status: 400 })
    }

    const profileUpdate = {
      ...(monthly_income_range ? { monthly_income_range } : {}),
      monthly_income,
      income_frequency,
      primary_goal_category,
      ...(bodyHas('savings_confidence') ? { savings_confidence } : {}),
      savings_percent,
      ...(bodyHas('financial_stage') ? { financial_stage } : {}),
      ...(bodyHas('risk_comfort') ? { risk_comfort } : {}),
      ...(bodyHas('motivation_type') ? { motivation_type } : {}),
      ...(bodyHas('dream_statement') ? { dream_statement } : {}),
      onboarding_completed: true,
      profile_completion_percentage: 100,
      nickname: parsedNickname.nickname,
    }

    const { data: insertedGoal, error: goalError } = await supabaseAdmin
      .from('goals')
      .insert({
        user_id: user.id,
        name: goal_name,
        target_amount: goal_target,
        saved_amount: 0,
      })
      .select('id')
      .single()

    // Null when the free-plan trigger rejects the insert. That person already
    // has goals, so onboarding continues without adding one.
    let insertedGoalId: string | null = null
    if ((goalError?.message ?? '').includes('GOAL_LIMIT_REACHED')) {
      console.error('POST /api/onboarding/complete goal insert error:', goalError)
    } else if (goalError || !insertedGoal?.id) {
      return NextResponse.json(
        {
          error: goalError
            ? plainDbError(goalError, 'save', 'POST /api/onboarding/complete goal insert error:')
            : 'Could not create your goal.',
        },
        { status: 500 }
      )
    } else {
      insertedGoalId = insertedGoal.id
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id)

    if (profileError) {
      // Drop a goal this request inserted. A limit skip inserted nothing, so
      // existing goals stay. The failed profile write leaves nickname unchanged.
      if (insertedGoalId) {
        const { error: rollbackGoalError } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('id', insertedGoalId)
          .eq('user_id', user.id)
        if (rollbackGoalError) {
          console.error('POST /api/onboarding/complete goal rollback', rollbackGoalError.message)
        }
      }
      return NextResponse.json(
        { error: plainDbError(profileError, 'save', 'POST /api/onboarding/complete profile update error:') },
        { status: 500 }
      )
    }

    const today = toLocalDateString(new Date())
    const { data: insertedIncome, error: incomeError } = await supabaseAdmin
      .from('income_records')
      .insert({
        user_id: user.id,
        total_amount: pay_period_income,
        disposable_amount: pay_period_income,
        date: today,
        income_source: null,
      })
      .select('id')
      .single()

    if (incomeError || !insertedIncome?.id) {
      // Profile was already marked complete. Drop a goal this request inserted,
      // and clear onboarding so a retry does not finish without this income.
      if (insertedGoalId) {
        const { error: rollbackGoalError } = await supabaseAdmin
          .from('goals')
          .delete()
          .eq('id', insertedGoalId)
          .eq('user_id', user.id)
        if (rollbackGoalError) {
          console.error('POST /api/onboarding/complete goal rollback', rollbackGoalError.message)
        }
      }
      const { error: rollbackProfileError } = await supabaseAdmin
        .from('profiles')
        .update({ onboarding_completed: false })
        .eq('id', user.id)
      if (rollbackProfileError) {
        console.error('POST /api/onboarding/complete profile rollback', rollbackProfileError.message)
      }
      return NextResponse.json(
        {
          error: incomeError
            ? plainDbError(incomeError, 'save', 'POST /api/onboarding/complete income insert error:')
            : 'Could not save your first income.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, income_id: insertedIncome.id })
  } catch (e) {
    console.error('POST /api/onboarding/complete', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
