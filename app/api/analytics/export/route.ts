import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * PostgREST returns at most this many rows per request. Read until a short page.
 */
const EXPORT_PAGE_SIZE = 1000

type IncomeExportRow = { date: string; total_amount: number; income_source: string | null }
type ExpenseExportRow = { date: string; amount: number; category: string; type: string }

async function readAllForUser<T>(
  table: 'income_records' | 'expenses',
  columns: string,
  userId: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) {
      throw new Error(`export read failed for ${table}`)
    }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < EXPORT_PAGE_SIZE) return rows
  }
}

/**
 * GET — Export income + expenses as CSV for any signed-in user.
 * Rows are read with the service role after the session is checked, so the
 * 90-day free-history policy and the 1,000-row cap do not truncate the file.
 * The filter is always the authenticated user id.
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

    const [incomeRows, expenseRows] = await Promise.all([
      readAllForUser<IncomeExportRow>('income_records', 'date, total_amount, income_source', user.id),
      readAllForUser<ExpenseExportRow>('expenses', 'date, amount, category, type', user.id),
    ])

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
  } catch {
    console.error('GET /api/analytics/export failed')
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
