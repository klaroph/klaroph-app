import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { toLocalDateString } from '@/lib/format'

/**
 * GET /api/expense-months
 * Returns months (YYYY-MM-01) where the user has at least one expense.
 * Used to limit budget month picker to months with actual expense data.
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

    const now = new Date()
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 24, now.getDate())
    const cutoffStr = toLocalDateString(cutoff)

    const { data, error } = await supabase
      .from('expenses')
      .select('date')
      .eq('user_id', user.id)
      .gte('date', cutoffStr)
      .order('date', { ascending: false })

    if (error) {
      console.error('GET /api/expense-months error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const monthSet = new Set<string>()
    for (const row of data ?? []) {
      const d = (row as { date: string }).date
      if (!d) continue
      const [y, m] = d.slice(0, 10).split('-').map(Number)
      const first = `${y}-${String(m).padStart(2, '0')}-01`
      monthSet.add(first)
    }

    const months = Array.from(monthSet).sort().reverse()
    return NextResponse.json(months)
  } catch (e) {
    console.error('GET /api/expense-months', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
