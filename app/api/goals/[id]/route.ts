import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type RouteParams = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Goal ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const name =
      typeof body?.name === 'string' ? body.name.trim() : ''
    const targetAmount =
      typeof body?.target_amount === 'number'
        ? body.target_amount
        : Number(body?.target_amount)
    if (!name || Number.isNaN(targetAmount) || targetAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid name or target_amount.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('goals')
      .update({ name, target_amount: targetAmount })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, target_amount, saved_amount, created_at')
      .single()

    if (error) {
      console.error('PUT /api/goals/[id] update error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Goal not found.' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('PUT /api/goals/[id]', e)
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
      return NextResponse.json({ error: 'Goal ID required.' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/goals/[id] error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/goals/[id]', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
