import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

function toFirstDayOfMonth(input?: string | number): string {
  const d = new Date(input ?? Date.now())
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
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
        .select('category, amount')
        .eq('user_id', user.id),
      supabase
        .from('budget_overrides')
        .select('category, amount')
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

    const planByCategory: Record<string, number> = {}
    for (const row of planRes.data ?? []) {
      const r = row as { category: string; amount: number }
      planByCategory[r.category] = Number(r.amount)
    }

    const overrideByCategory: Record<string, number> = {}
    for (const row of overridesRes.data ?? []) {
      const r = row as { category: string; amount: number }
      overrideByCategory[r.category] = Number(r.amount)
    }

    const categories = new Set([
      ...Object.keys(planByCategory),
      ...Object.keys(overrideByCategory),
    ])

    const effective: { category: string; amount: number }[] = []
    for (const category of categories) {
      const amount =
        overrideByCategory[category] ??
        planByCategory[category] ??
        0
      effective.push({ category, amount })
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
