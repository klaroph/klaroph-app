import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'

function toFirstDayOfMonth(input?: string | number): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = parseLocalDateString(input)
    return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const now = typeof input === 'number' ? new Date(input) : new Date()
  return toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
}

/** GET /api/budget-effective?month=YYYY-MM-DD
 * Returns effective budget per category for the given month: override ?? plan.
 */
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

    const [planRes, overridesRes] = await Promise.all([
      supabase
        .from('budget_plans')
        .select('category, amount, note')
        .eq('user_id', user.id),
      supabase
        .from('budget_overrides')
        .select('category, amount, note')
        .eq('user_id', user.id)
        .eq('month', month),
    ])

    if (planRes.error) {
      console.error('GET /api/budget-effective plan error:', planRes.error.message)
      return NextResponse.json(
        { error: planRes.error.message },
        { status: 500 }
      )
    }
    if (overridesRes.error) {
      console.error('GET /api/budget-effective overrides error:', overridesRes.error.message)
      return NextResponse.json(
        { error: overridesRes.error.message },
        { status: 500 }
      )
    }

    const planByCategory: Record<string, { amount: number; note?: string | null }> = {}
    for (const row of planRes.data ?? []) {
      const r = row as { category: string; amount: number; note?: string | null }
      planByCategory[r.category] = { amount: Number(r.amount), note: r.note ?? null }
    }

    const overrideByCategory: Record<string, { amount: number; note?: string | null }> = {}
    for (const row of overridesRes.data ?? []) {
      const r = row as { category: string; amount: number; note?: string | null }
      overrideByCategory[r.category] = { amount: Number(r.amount), note: r.note ?? null }
    }

    const categories = new Set([
      ...Object.keys(planByCategory),
      ...Object.keys(overrideByCategory),
    ])

    const effective: { category: string; amount: number; note?: string | null }[] = []
    for (const category of categories) {
      const override = overrideByCategory[category]
      const plan = planByCategory[category]
      const amount = override?.amount ?? plan?.amount ?? 0
      const note = override?.note ?? plan?.note ?? null
      effective.push({ category, amount, note: note || undefined })
    }
    effective.sort((a, b) => a.category.localeCompare(b.category))

    return NextResponse.json(effective)
  } catch (e) {
    console.error('GET /api/budget-effective', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
