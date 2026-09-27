/**
 * Daily Founder Report. Invoked by Vercel Cron (vercel.json: 02:00 UTC = 10:00 Asia/Manila),
 * which sends `Authorization: Bearer ${CRON_SECRET}`. Unset CRON_SECRET = locked for everyone.
 */

import { NextResponse } from 'next/server'
import { authorizeFounderDashboardRequest } from '@/lib/founderDashboardAuth'
import { runDailyFounderReport } from '@/lib/founder/alertsServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = authorizeFounderDashboardRequest(request.headers.get('authorization'), process.env.CRON_SECRET)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const outcome = await runDailyFounderReport(new Date())
  return NextResponse.json(
    { status: outcome.status, reportDate: outcome.reportDate },
    { status: outcome.status === 'failed' ? 500 : 200 }
  )
}
