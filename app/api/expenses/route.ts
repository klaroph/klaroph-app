import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getTypeForCategory } from '@/lib/expenseCategories'

type CreateBody = {
  category?: string
  type?: string
  amount?: number
  date?: string
  description?: string | null
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
    const category =
      typeof body?.category === 'string' ? body.category.trim() : ''
    const amount =
      typeof body?.amount === 'number' ? body.amount : Number(body?.amount)
    const date =
      typeof body?.date === 'string' && body.date.trim()
        ? body.date.trim()
        : new Date().toISOString().slice(0, 10)
    const description =
      typeof body?.description === 'string' ? body.description.trim() || null : null

    if (!category || Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid category or amount.' },
        { status: 400 }
      )
    }

    const type = getTypeForCategory(category)

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        category,
        type,
        amount,
        date,
        description,
      })
      .select('id, category, type, amount, date, description')
      .single()

    if (error) {
      console.error('POST /api/expenses insert error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('POST /api/expenses', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
