import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolvePlanAndBudgetEntitlement } from '@/lib/entitlements'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const NOTE_MAX_LENGTH = 150

function toFirstDayOfMonth(input?: string | number): string {
  const d = new Date(input ?? Date.now())
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function trimNote(v: unknown): string | null {
  if (v == null) return null
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s.length > NOTE_MAX_LENGTH ? s.slice(0, NOTE_MAX_LENGTH) : s
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month')
    const month = toFirstDayOfMonth(monthParam || undefined)

    const { data, error } = await supabase
      .from('budget_overrides')
      .select('id, user_id, category, amount, month, note, created_at')
      .eq('user_id', user.id)
      .eq('month', month)
      .order('category')

    if (error) {
      console.error('GET /api/budget-overrides error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('GET /api/budget-overrides', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

type PostBody = { category?: string; amount?: number; month?: string; note?: string | null }

export async function POST(request: Request) {
  try {
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

    const body = (await request.json().catch(() => ({}))) as PostBody
    const category =
      typeof body?.category === 'string' ? body.category.trim() : ''
    const amount =
      typeof body?.amount === 'number' ? body.amount : Number(body?.amount)
    const month = toFirstDayOfMonth(body?.month)

    if (!category || Number.isNaN(amount) || amount < 0) {
      return NextResponse.json(
        { error: 'Invalid category or amount.' },
        { status: 400 }
      )
    }

    const note = trimNote(body?.note) ?? null

    const { data, error } = await supabase
      .from('budget_overrides')
      .upsert(
        {
          user_id: user.id,
          category,
          amount,
          month,
          note,
        },
        { onConflict: 'user_id,category,month', ignoreDuplicates: false }
      )
      .select('id, user_id, category, amount, month, note, created_at')
      .single()

    if (error) {
      console.error('POST /api/budget-overrides error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('POST /api/budget-overrides', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
