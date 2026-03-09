import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolvePlanAndBudgetEntitlement } from '@/lib/entitlements'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlanRow = {
  id: string
  user_id: string
  category: string
  amount: number
  created_at?: string
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('budget_plans')
      .select('id, user_id, category, amount, created_at')
      .eq('user_id', user.id)
      .order('category')

    if (error) {
      console.error('GET /api/budget-plan error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json((data as PlanRow[]) ?? [])
  } catch (e) {
    console.error('GET /api/budget-plan', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

type PostItem = { category?: string; amount?: number }

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

    const body = (await request.json().catch(() => ({}))) as PostItem[] | PostItem
    const items = Array.isArray(body) ? body : [body]

    const rows: { user_id: string; category: string; amount: number }[] = []
    for (const item of items) {
      const category =
        typeof item?.category === 'string' ? item.category.trim() : ''
      const amount =
        typeof item?.amount === 'number' ? item.amount : Number(item?.amount)
      if (!category || Number.isNaN(amount) || amount <= 0) continue
      rows.push({ user_id: user.id, category, amount })
    }

    if (rows.length === 0) {
      const { error: delErr } = await supabase
        .from('budget_plans')
        .delete()
        .eq('user_id', user.id)
      if (delErr) {
        console.error('POST /api/budget-plan delete error:', delErr.message)
        return NextResponse.json(
          { error: delErr.message },
          { status: 500 }
        )
      }
      return NextResponse.json({ ok: true, data: [] })
    }

    const { error: delErr } = await supabase
      .from('budget_plans')
      .delete()
      .eq('user_id', user.id)
    if (delErr) {
      console.error('POST /api/budget-plan delete error:', delErr.message)
      return NextResponse.json(
        { error: delErr.message },
        { status: 500 }
      )
    }

    const { data, error } = await supabase
      .from('budget_plans')
      .insert(rows)
      .select('id, user_id, category, amount, created_at')

    if (error) {
      console.error('POST /api/budget-plan insert error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, data: (data as PlanRow[]) ?? [] })
  } catch (e) {
    console.error('POST /api/budget-plan', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
