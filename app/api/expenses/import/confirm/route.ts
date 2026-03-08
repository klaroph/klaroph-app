import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { validateExpensesCsv, validateImportRows, getTypeForCategoryValue, VALID_CATEGORIES, type ImportRow } from '@/lib/expensesImport'

const FREE_IMPORT_LIMIT = 2

/**
 * POST /api/expenses/import/confirm
 * After client validation: re-validate, check quota, insert rows, increment import_count.
 * Body: { rows: ExpenseImportRow[] } (from validation response) or { csv: string } to re-validate.
 * Only increments on full success.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const plan = await resolveUserPlan(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('import_count')
      .eq('id', user.id)
      .maybeSingle()

    const importCount = typeof (profile as { import_count?: number } | null)?.import_count === 'number'
      ? (profile as { import_count: number }).import_count
      : 0

    if (plan.plan_name !== 'pro' && importCount >= FREE_IMPORT_LIMIT) {
      return NextResponse.json(
        {
          error: 'You’ve used your 2 free imports. Upgrade to Pro for unlimited CSV imports.',
          code: 'IMPORT_QUOTA_EXCEEDED',
        },
        { status: 403 }
      )
    }

    const body = (await request.json()) as { rows?: unknown; csv?: string }
    let rows: ImportRow[]

    if (body.rows != null) {
      const validated = validateImportRows(body.rows, VALID_CATEGORIES)
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }
      rows = validated.rows
    } else if (typeof body.csv === 'string') {
      const result = validateExpensesCsv(body.csv)
      if (!result.ok || result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid or empty file. Fix errors and try again.', errors: result.errors },
          { status: 400 }
        )
      }
      rows = result.rows
    } else {
      return NextResponse.json({ error: 'Missing rows or csv in body.' }, { status: 400 })
    }

    const inserts = rows.map((r) => ({
      user_id: user.id,
      category: r.category,
      type: getTypeForCategoryValue(r.category),
      amount: r.amount,
      date: r.date,
      description: r.description || null,
    }))

    const { error: insertError } = await supabase.from('expenses').insert(inserts)

    if (insertError) {
      console.error('POST /api/expenses/import/confirm insert error:', insertError.message)
      return NextResponse.json(
        { error: insertError.message || 'Failed to save expenses.' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ import_count: importCount + 1 })
      .eq('id', user.id)

    if (updateError) {
      console.error('POST /api/expenses/import/confirm profile update error:', updateError.message)
      return NextResponse.json(
        { error: 'Imports saved but usage count could not be updated.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ imported: rows.length }, { status: 200 })
  } catch (e) {
    console.error('POST /api/expenses/import/confirm', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
