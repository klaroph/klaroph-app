import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

/**
 * GET — Return current user's income and expense record counts (for upgrade triggers).
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [incRes, expRes] = await Promise.all([
      supabase.from('income_records').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    const incomeCount = incRes.count ?? 0
    const expenseCount = expRes.count ?? 0
    return NextResponse.json({ incomeCount, expenseCount })
  } catch (e) {
    console.error('GET /api/analytics/counts', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
