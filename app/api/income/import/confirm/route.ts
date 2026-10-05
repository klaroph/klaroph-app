import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isImportQuotaExceededError, plainDbError } from '@/lib/apiError'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { validateIncomeCsv, validateImportRows, INCOME_SOURCES_SET, type ImportRow } from '@/lib/expensesImport'

const FREE_IMPORT_LIMIT = 2

const IMPORT_QUOTA_EXCEEDED_BODY = {
  error: "You've used your 2 free imports. Explore KlaroPH Pro for unlimited CSV imports.",
  code: 'IMPORT_QUOTA_EXCEEDED',
}

/**
 * POST /api/income/import/confirm
 * Re-validate rows, check shared quota (same as expenses), consume import quota, then insert into income_records.
 * If the insert fails after a successful consume, refund the quota in the same request
 * via the service-role client. refund_import_quota is not executable by authenticated.
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
      return NextResponse.json(IMPORT_QUOTA_EXCEEDED_BODY, { status: 403 })
    }

    const body = (await request.json()) as { rows?: unknown; csv?: string }
    let rows: ImportRow[]

    if (body.rows != null) {
      const validated = validateImportRows(body.rows, INCOME_SOURCES_SET)
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }
      rows = validated.rows
    } else if (typeof body.csv === 'string') {
      const result = validateIncomeCsv(body.csv)
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
      total_amount: r.amount,
      disposable_amount: r.amount,
      date: r.date,
      income_source: r.category,
    }))

    const { error: quotaError } = await supabase.rpc('consume_import_quota')

    if (quotaError) {
      if (isImportQuotaExceededError(quotaError)) {
        return NextResponse.json(IMPORT_QUOTA_EXCEEDED_BODY, { status: 403 })
      }
      console.error('POST /api/income/import/confirm quota error:', quotaError.message)
      return NextResponse.json(
        { error: 'Could not update import usage. Nothing was imported.' },
        { status: 500 }
      )
    }

    const { error: insertError } = await supabase.from('income_records').insert(inserts)

    if (insertError) {
      const { error: refundError } = await supabaseAdmin.rpc('refund_import_quota', {
        p_user_id: user.id,
      })
      if (refundError) {
        console.error('POST /api/income/import/confirm refund error:', refundError.message)
      }
      return NextResponse.json(
        { error: plainDbError(insertError, 'save', 'POST /api/income/import/confirm insert error:') },
        { status: 500 }
      )
    }

    return NextResponse.json({ imported: rows.length }, { status: 200 })
  } catch (e) {
    console.error('POST /api/income/import/confirm', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
