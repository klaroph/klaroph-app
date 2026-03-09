import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolvePlanAndBudgetEntitlement } from '@/lib/entitlements'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type RouteParams = { params: Promise<{ id: string }> }

function toFirstDayOfMonth(input?: string | number): string {
  const d = new Date(input ?? Date.now())
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

type PatchBody = { amount?: number; month?: string }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { error: 'Override ID required.' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin.from('profiles').select('simulate_budget_expired').eq('id', user.id).maybeSingle()
    const simulateBudgetExpired = (profile as { simulate_budget_expired?: boolean } | null)?.simulate_budget_expired === true
    const effectiveCreatedAt = simulateBudgetExpired
      ? new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      : (user as { created_at?: string }).created_at

    const { budgetEditingAllowed } = await resolvePlanAndBudgetEntitlement(
      user.id,
      effectiveCreatedAt
    )
    if (!budgetEditingAllowed) {
      return NextResponse.json(
        { error: BUDGET_LOCK_UPGRADE_MESSAGE, locked: true, reason: 'budget' },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody
    const amount =
      typeof body?.amount === 'number' ? body.amount : Number(body?.amount)
    const monthInput = typeof body?.month === 'string' ? body.month : undefined

    const payload: { amount?: number; month?: string } = {}
    if (!Number.isNaN(amount) && amount >= 0) payload.amount = amount
    if (monthInput !== undefined) payload.month = toFirstDayOfMonth(monthInput)

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { error: 'Provide amount or month to update.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('budget_overrides')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, user_id, category, amount, month, created_at')
      .single()

    if (error) {
      console.error('PATCH /api/budget-overrides/[id] error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Override not found.' },
        { status: 404 }
      )
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('PATCH /api/budget-overrides/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { error: 'Override ID required.' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin.from('profiles').select('simulate_budget_expired').eq('id', user.id).maybeSingle()
    const simulateBudgetExpired = (profile as { simulate_budget_expired?: boolean } | null)?.simulate_budget_expired === true
    const effectiveCreatedAt = simulateBudgetExpired
      ? new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      : (user as { created_at?: string }).created_at

    const { budgetEditingAllowed } = await resolvePlanAndBudgetEntitlement(
      user.id,
      effectiveCreatedAt
    )
    if (!budgetEditingAllowed) {
      return NextResponse.json(
        { error: BUDGET_LOCK_UPGRADE_MESSAGE, locked: true, reason: 'budget' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('budget_overrides')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/budget-overrides/[id] error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return new Response(null, { status: 204 })
  } catch (e) {
    console.error('DELETE /api/budget-overrides/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
