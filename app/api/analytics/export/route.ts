import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlan } from '@/lib/resolveUserPlan'

/**
 * GET — Export income + expenses as CSV. Premium only.
 * Free users get 403 with { locked: true, reason: 'export' } so the client can show the upgrade modal.
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

    const plan = await resolveUserPlan(user.id)
    if (!plan.export_enabled) {
      return NextResponse.json(
        { error: 'Export CSV is a Pro feature.', locked: true, reason: 'export' },
        { status: 403 }
      )
    }

    const [incRes, expRes] = await Promise.all([
      supabase
        .from('income_records')
        .select('date, total_amount, income_source')
        .order('date', { ascending: false }),
      supabase
        .from('expenses')
        .select('date, amount, category, type')
        .order('date', { ascending: false }),
    ])

    const incomeRows = (incRes.data ?? []) as { date: string; total_amount: number; income_source: string | null }[]
    const expenseRows = (expRes.data ?? []) as { date: string; amount: number; category: string; type: string }[]

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
        'Content-Disposition': 'attachment; filename="klaroph-export.csv"',
      },
    })
  } catch (e) {
    console.error('GET /api/analytics/export', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
