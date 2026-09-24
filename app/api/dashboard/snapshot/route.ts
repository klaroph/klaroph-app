import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  getLast6MonthsTrendRange,
  getMonthBounds,
  type DashboardSnapshot,
  type SnapshotExpenseRow,
  type SnapshotIncomeRow,
} from '@/lib/dashboardSnapshot'
import { toLocalDateString } from '@/lib/format'

/**
 * GET /api/dashboard/snapshot?month=YYYY-MM-01
 * Single parent payload for dashboard month widgets (budget spend, cashflow, 6-mo trend).
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

    const url = new URL(request.url)
    const monthParam = url.searchParams.get('month')
    const now = new Date()
    const monthFirst =
      monthParam && /^\d{4}-\d{2}-01$/.test(monthParam)
        ? monthParam
        : toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))

    const { start: monthStart, end: monthEnd } = getMonthBounds(monthFirst)
    const { start: trendStart, end: trendEnd } = getLast6MonthsTrendRange(now)

    const [monthExpRes, monthIncRes, trendExpRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('category, type, amount, date')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false }),
      supabase
        .from('income_records')
        .select('total_amount, date, income_source')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false }),
      supabase
        .from('expenses')
        .select('amount, date')
        .eq('user_id', user.id)
        .gte('date', trendStart)
        .lte('date', trendEnd)
        .order('date', { ascending: true }),
    ])

    if (monthExpRes.error || monthIncRes.error || trendExpRes.error) {
      return NextResponse.json(
        {
          error:
            monthExpRes.error?.message ||
            monthIncRes.error?.message ||
            trendExpRes.error?.message ||
            'Could not load snapshot.',
        },
        { status: 500 }
      )
    }

    const payload: DashboardSnapshot = {
      monthFirst,
      monthStart,
      monthEnd,
      trendStart,
      trendEnd,
      monthExpenses: (monthExpRes.data as SnapshotExpenseRow[]) ?? [],
      monthIncome: (monthIncRes.data as SnapshotIncomeRow[]) ?? [],
      trendExpenses: (trendExpRes.data as { amount: number; date: string }[]) ?? [],
    }

    return NextResponse.json(payload)
  } catch (e) {
    console.error('GET /api/dashboard/snapshot', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
