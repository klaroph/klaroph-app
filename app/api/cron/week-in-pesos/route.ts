/**
 * Weekly summary. Vercel Cron (vercel.json): Monday 00:00 UTC = 08:00 Asia/Manila.
 * Covers the previous Manila Monday 00:00 through Sunday 23:59.
 * Sends only when WEEKLY_SUMMARY_SENDS_ENABLED is exactly "true".
 * `?test=1` sends one [TEST] message to MARKETING_TEST_EMAIL and does not mail the audience.
 */

import { NextResponse } from 'next/server'
import { runWeeklySummary, sendWeeklySummaryTest } from '@/lib/email/weeklySummary'
import { authorizeFounderDashboardRequest } from '@/lib/founderDashboardAuth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = authorizeFounderDashboardRequest(request.headers.get('authorization'), process.env.CRON_SECRET)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const testSend = new URL(request.url).searchParams.get('test') === '1'
  const outcome = testSend ? await sendWeeklySummaryTest(new Date()) : await runWeeklySummary(new Date())
  return NextResponse.json(outcome.body, { status: outcome.status })
}
