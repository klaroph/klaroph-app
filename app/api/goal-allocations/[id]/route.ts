import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { removeGoalAllocation, updateGoalAllocation, type AllocationMutationResult } from '@/lib/goalAllocations'

type RouteParams = { params: Promise<{ id: string }> }

function respond(result: AllocationMutationResult) {
  return result.ok
    ? NextResponse.json({ ok: true, amount: result.amount })
    : NextResponse.json({ error: result.error }, { status: result.status })
}

async function authedClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const { supabase, user } = await authedClient()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as { amount?: unknown } | null
    return respond(await updateGoalAllocation(supabase, user.id, id, body?.amount))
  } catch (e) {
    console.error('PATCH /api/goal-allocations/[id]', e instanceof Error ? e.message : 'unknown error')
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const { supabase, user } = await authedClient()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    return respond(await removeGoalAllocation(supabase, user.id, id))
  } catch (e) {
    console.error('DELETE /api/goal-allocations/[id]', e instanceof Error ? e.message : 'unknown error')
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
