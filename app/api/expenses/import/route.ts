import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { validateExpensesCsv, MAX_FILE_BYTES, MAX_ROWS } from '@/lib/expensesImport'

/** POST /api/expenses/import — validate CSV only; no quota consumed. Body: FormData with "file". */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_BYTES / 1024}KB.` },
        { status: 400 }
      )
    }

    const content = await file.text()
    const result = validateExpensesCsv(content)

    return NextResponse.json({
      ok: result.ok,
      rows: result.rows,
      rowCount: result.rows.length,
      errors: result.errors,
      skippedEmpty: result.skippedEmpty,
      unknownCategories: result.unknownCategories,
      maxRows: MAX_ROWS,
    })
  } catch (e) {
    console.error('POST /api/expenses/import', e)
    return NextResponse.json(
      { error: 'Something went wrong validating the file.' },
      { status: 500 }
    )
  }
}
