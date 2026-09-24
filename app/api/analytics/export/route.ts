import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { EXPORT_PAGE_DEFAULT, EXPORT_PAGE_MAX } from '@/lib/dashboardSnapshot'

/**
 * GET — Export income + expenses as CSV. Premium only.
 * Paginated: ?limit=1000&offset=0 (defaults). Caps at EXPORT_PAGE_MAX per request.
 * Free users get 403 with { locked: true, reason: 'export' }.
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

    const plan = await resolveUserPlan(user.id)
    if (!plan.export_enabled) {
      return NextResponse.json(
        { error: 'Export CSV is a Pro feature.', locked: true, reason: 'export' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const rawLimit = Number(url.searchParams.get('limit') ?? EXPORT_PAGE_DEFAULT)
    const rawOffset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Math.min(
      EXPORT_PAGE_MAX,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : EXPORT_PAGE_DEFAULT)
    )
    const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0)
    const rangeEnd = offset + limit - 1

    const [incRes, expRes] = await Promise.all([
      supabase
        .from('income_records')
        .select('date, total_amount, income_source', { count: 'exact' })
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .range(offset, rangeEnd),
      supabase
        .from('expenses')
        .select('date, amount, category, type', { count: 'exact' })
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .range(offset, rangeEnd),
    ])

    if (incRes.error || expRes.error) {
      return NextResponse.json(
        { error: incRes.error?.message || expRes.error?.message || 'Export failed.' },
        { status: 500 }
      )
    }

    const incomeRows = (incRes.data ?? []) as {
      date: string
      total_amount: number
      income_source: string | null
    }[]
    const expenseRows = (expRes.data ?? []) as {
      date: string
      amount: number
      category: string
      type: string
    }[]

    const incomeTotal = incRes.count ?? incomeRows.length
    const expenseTotal = expRes.count ?? expenseRows.length
    const hasMore =
      offset + incomeRows.length < incomeTotal || offset + expenseRows.length < expenseTotal

    const csvHeader = 'Type,Date,Amount,Category/Source\n'
    const incomeLines = incomeRows
      .map((r) => `Income,${r.date},${Number(r.total_amount)},${String(r.income_source ?? '').replace(/,/g, ' ')}`)
      .join('\n')
    const expenseLines = expenseRows
      .map((r) => `Expense,${r.date},${Number(r.amount)},${String(r.category ?? '').replace(/,/g, ' ')}`)
      .join('\n')
    const csv = csvHeader + incomeLines + (incomeLines && expenseLines ? '\n' : '') + expenseLines

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="klaroph-export-${offset}-${offset + limit}.csv"`,
        'X-Export-Limit': String(limit),
        'X-Export-Offset': String(offset),
        'X-Export-Income-Total': String(incomeTotal),
        'X-Export-Expense-Total': String(expenseTotal),
        'X-Export-Has-More': hasMore ? '1' : '0',
      },
    })
  } catch (e) {
    console.error('GET /api/analytics/export', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
