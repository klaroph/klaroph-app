import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type RouteParams = { params: Promise<{ id: string }> }

type UpdateBody = {
  total_amount?: number
  date?: string
  income_source?: string | null
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Income record ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as UpdateBody
    const totalAmount =
      typeof body?.total_amount === 'number'
        ? body.total_amount
        : Number(body?.total_amount)
    const date =
      typeof body?.date === 'string' && body.date.trim()
        ? body.date.trim()
        : undefined
    const incomeSource =
      body?.income_source !== undefined
        ? (typeof body.income_source === 'string' ? body.income_source.trim() || null : null)
        : undefined

    if (Number.isNaN(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid total_amount.' },
        { status: 400 }
      )
    }

    const payload: { total_amount: number; disposable_amount: number; date?: string; income_source?: string | null } = {
      total_amount: totalAmount,
      disposable_amount: totalAmount,
    }
    if (date !== undefined) payload.date = date
    if (incomeSource !== undefined) payload.income_source = incomeSource

    const { data, error } = await supabase
      .from('income_records')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, total_amount, date, income_source')
      .single()

    if (error) {
      console.error('PUT /api/income/[id] update error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Income record not found.' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('PUT /api/income/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Income record ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('income_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/income/[id] error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/income/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
