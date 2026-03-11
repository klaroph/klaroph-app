import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/founder-dashboard
 *
 * Returns all founder metrics in one response (single RPC call).
 * Uses service_role; do not expose to client. Protect via middleware or
 * FOUNDER_DASHBOARD_SECRET (Bearer token) for production.
 *
 * Response shape matches get_founder_metrics() in DB:
 * total_users, new_users_today, dau, wau, mau, total_expenses,
 * active_budget_users, pro_users, free_to_pro_conversion,
 * seven_day_retention, auth_audit, first_value_moment, seven_day_retention_activity
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.FOUNDER_DASHBOARD_SECRET
    if (secret) {
      const auth = request.headers.get('authorization')
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { data, error } = await supabaseAdmin.rpc('get_founder_metrics')

    if (error) {
      console.error('GET /api/founder-dashboard rpc error:', error.message)
      return NextResponse.json(
        { error: error.message || 'Failed to load founder metrics' },
        { status: 500 }
      )
    }

    return NextResponse.json(data ?? {}, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('GET /api/founder-dashboard', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
