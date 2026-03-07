import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getTypeForCategory } from '@/lib/expenseCategories'

type RouteParams = { params: Promise<{ id: string }> }

type UpdateBody = {
  category?: string
  type?: string
  amount?: number
  date?: string
  description?: string | null
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Expense ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as UpdateBody
    const category =
      typeof body?.category === 'string' ? body.category.trim() : ''
    const amount =
      typeof body?.amount === 'number' ? body.amount : Number(body?.amount)
    const date =
      typeof body?.date === 'string' && body.date.trim()
        ? body.date.trim()
        : undefined
    const description =
      body?.description !== undefined
        ? (typeof body.description === 'string' ? body.description.trim() || null : null)
        : undefined

    if (!category || Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid category or amount.' },
        { status: 400 }
      )
    }

    const type = getTypeForCategory(category)

    const payload: { category: string; type: string; amount: number; date?: string; description?: string | null } = {
      category,
      type,
      amount,
    }
    if (date !== undefined) payload.date = date
    if (description !== undefined) payload.description = description

    const { data, error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, category, type, amount, date, description')
      .single()

    if (error) {
      console.error('PUT /api/expenses/[id] update error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('PUT /api/expenses/[id]', e)
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
      return NextResponse.json({ error: 'Expense ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/expenses/[id] error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/expenses/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
