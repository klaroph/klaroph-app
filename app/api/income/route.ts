import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { toLocalDateString } from '@/lib/format'

type CreateBody = {
  total_amount?: number
  date?: string
  income_source?: string | null
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as CreateBody
    const totalAmount =
      typeof body?.total_amount === 'number'
        ? body.total_amount
        : Number(body?.total_amount)
    const date =
      typeof body?.date === 'string' && body.date.trim()
        ? body.date.trim()
        : toLocalDateString(new Date())
    const incomeSource =
      body?.income_source !== undefined && body.income_source !== null
        ? (typeof body.income_source === 'string' ? body.income_source.trim() || null : null)
        : null

    if (Number.isNaN(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid total_amount.' },
        { status: 400 }
      )
    }

    const disposableAmount = totalAmount

    const { data, error } = await supabase
      .from('income_records')
      .insert({
        user_id: user.id,
        total_amount: totalAmount,
        disposable_amount: disposableAmount,
        date,
        income_source: incomeSource,
      })
      .select('id, total_amount, date, income_source')
      .single()

    if (error) {
      console.error('POST /api/income insert error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('POST /api/income', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
