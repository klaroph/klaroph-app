import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolvePlanAndBudgetEntitlement } from '@/lib/entitlements'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'

type RouteParams = { params: Promise<{ id: string }> }

function toFirstDayOfMonth(input?: string | number): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = parseLocalDateString(input)
    return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const now = typeof input === 'number' ? new Date(input) : new Date()
  return toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
}

const NOTE_MAX_LENGTH = 150

function trimNote(v: unknown): string | null {
  if (v == null) return null
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s.length > NOTE_MAX_LENGTH ? s.slice(0, NOTE_MAX_LENGTH) : s
}

type PatchBody = { amount?: number; month?: string; note?: string | null }

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

    const payload: { amount?: number; month?: string; note?: string | null } = {}
    if (!Number.isNaN(amount) && amount >= 0) payload.amount = amount
    if (monthInput !== undefined) payload.month = toFirstDayOfMonth(monthInput)
    if (body?.note !== undefined) payload.note = trimNote(body.note) ?? null

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
      .select('id, user_id, category, amount, month, note, created_at')
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
