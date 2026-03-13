import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type RouteParams = { params: Promise<{ id: string }> }

type AllocationItem = { goal_id: string; amount: number }

type UpdateBody = {
  total_amount?: number
  date?: string
  income_source?: string | null
  allocations?: AllocationItem[]
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

    const rawAllocations = Array.isArray(body?.allocations) ? body.allocations : []
    const allocations: AllocationItem[] = []
    for (const a of rawAllocations) {
      const goalId = typeof a?.goal_id === 'string' ? a.goal_id.trim() : ''
      const amt = typeof a?.amount === 'number' ? a.amount : Number(a?.amount)
      if (goalId && !Number.isNaN(amt) && amt > 0) {
        allocations.push({ goal_id: goalId, amount: amt })
      }
    }
    const allocatedSum = allocations.reduce((s, a) => s + a.amount, 0)
    if (allocatedSum > totalAmount) {
      return NextResponse.json(
        { error: 'Total allocations cannot exceed income amount.' },
        { status: 400 }
      )
    }

    const { data: currentRow } = await supabase
      .from('income_records')
      .select('date, income_source')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!currentRow) {
      return NextResponse.json({ error: 'Income record not found.' }, { status: 404 })
    }

    const resolvedDate = date ?? (currentRow as { date: string }).date
    const resolvedIncomeSource =
      incomeSource !== undefined ? incomeSource : (currentRow as { income_source: string | null }).income_source

    const { data, error } = await supabase.rpc('update_income_with_allocations', {
      p_income_id: id,
      p_user_id: user.id,
      p_total_amount: totalAmount,
      p_date: resolvedDate,
      p_income_source: resolvedIncomeSource,
      p_allocations: allocations,
    })

    if (error) {
      const msg = error.message ?? ''
      if (msg.includes('Income record not found or unauthorized')) {
        return NextResponse.json({ error: 'Income record not found.' }, { status: 404 })
      }
      if (
        msg.includes('Total allocations cannot exceed') ||
        msg.includes('Invalid goal in allocations') ||
        msg.includes('Invalid allocations')
      ) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      console.error('PUT /api/income/[id] RPC error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return NextResponse.json({ error: 'Income record not found.' }, { status: 404 })
    }

    return NextResponse.json({
      id: (row as { id: string }).id,
      total_amount: (row as { total_amount: number }).total_amount,
      date: (row as { date: string }).date,
      income_source: (row as { income_source: string | null }).income_source,
    })
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

    const { error: allocError } = await supabase
      .from('income_allocations')
      .delete()
      .eq('income_record_id', id)

    if (allocError) {
      console.error('DELETE /api/income/[id] allocations error:', allocError)
      return NextResponse.json(
        { error: 'Failed to delete linked allocations.' },
        { status: 500 }
      )
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
