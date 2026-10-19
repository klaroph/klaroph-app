/**
 * Payday summary. Vercel Cron (vercel.json): 00:00 UTC on the 15th and the 28th-31st,
 * which is 08:00 Asia/Manila.
 * The half-month is computed from this request fire time, not from a cron header.
 * Sends only when WEEKLY_SUMMARY_SENDS_ENABLED is exactly "true".
 * `?test=1` sends one [TEST] message to MARKETING_TEST_EMAIL and does not mail the audience.
 */

import { NextResponse } from 'next/server'
import { runPaydaySummary, sendPaydaySummaryTest } from '@/lib/email/paydaySummary'
import { authorizeFounderDashboardRequest } from '@/lib/founderDashboardAuth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = authorizeFounderDashboardRequest(request.headers.get('authorization'), process.env.CRON_SECRET)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const testSend = new URL(request.url).searchParams.get('test') === '1'
  const firedAt = new Date()
  const outcome = testSend ? await sendPaydaySummaryTest(firedAt) : await runPaydaySummary(firedAt)
  return NextResponse.json(outcome.body, { status: outcome.status })
}
