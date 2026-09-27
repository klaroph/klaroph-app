/**
 * Daily Founder Report model. Pure: built from the same Founder Dock snapshot and Support Inbox
 * threads the dock renders, so every number follows the dock's rules (testers excluded,
 * live PayMongo only). Sources that failed to load are reported as unavailable, never as zero.
 */

import type { AttentionItem, RevenueSummary } from '@/lib/founder/metrics'
import type { SupportThread } from '@/lib/founder/support'
import type { FounderUser } from '@/lib/founder/userList'

const TIME_ZONE = 'Asia/Manila'
/** The Philippines is UTC+8 all year (no daylight saving), so Manila midnight is a fixed UTC instant. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
export const NEEDS_ACTION_LIMIT = 5

/** One Manila calendar day: [start, end) in UTC instants. */
export type ReportWindow = { date: string; start: Date; end: Date }

/** The previous Manila calendar day relative to `now`, regardless of the server's time zone. */
export function manilaReportWindow(now: Date): ReportWindow {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS)
  const todayStart = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()) - MANILA_OFFSET_MS
  return windowStartingAt(todayStart - DAY_MS)
}

function windowStartingAt(startMs: number): ReportWindow {
  return {
    date: new Date(startMs + MANILA_OFFSET_MS).toISOString().slice(0, 10),
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS),
  }
}

export function previousWindow(w: ReportWindow): ReportWindow {
  return windowStartingAt(w.start.getTime() - DAY_MS)
}

export function inWindow(iso: string | null | undefined, w: ReportWindow): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return t >= w.start.getTime() && t < w.end.getTime()
}

export function formatReportDate(w: ReportWindow, style: 'short' | 'long'): string {
  return w.start.toLocaleDateString('en-US', {
    timeZone: TIME_ZONE,
    ...(style === 'short'
      ? { month: 'short', day: 'numeric' }
      : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  })
}

export type ReportSnapshot = {
  users: FounderUser[]
  revenue: Pick<RevenueSummary, 'recent' | 'failures'>
  database: { ok: boolean }
  attention: AttentionItem[]
  /** Founder Dock source labels that failed to load (e.g. 'Payments'). */
  unavailable: string[]
}

export type NeedsActionItem = { who: string; title: string; waitingDays: number }

export type FounderReport = {
  window: ReportWindow
  shortLabel: string
  longLabel: string
  /** Activity inside the reporting window. Null = source unavailable. */
  yesterday: {
    newUsers: number | null
    newUsersPreviousDay: number | null
    payments: { count: number; gross: number } | null
    failedPayments: number | null
    newSupportRequests: number | null
  }
  /** Snapshot at report time. */
  current: { active: number | null; dormant: number | null; pro: number | null }
  support: { open: number; awaitingReply: number; oldestWaitingDays: number | null; needsAction: NeedsActionItem[] } | null
  health: string[]
  quiet: boolean
}

const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS))

export function buildFounderReport(input: {
  now: Date
  snapshot: ReportSnapshot
  /** Support Inbox threads; null when they could not be loaded. */
  support: SupportThread[] | null
}): FounderReport {
  const { now, snapshot } = input
  const window = manilaReportWindow(now)
  const before = previousWindow(window)
  const missing = new Set(snapshot.unavailable)

  const usersOk = !missing.has('Accounts') && !missing.has('Profiles')
  const realUsers = usersOk ? snapshot.users.filter((u) => !u.isTester) : null
  const paymentsOk = !missing.has('Payments') && usersOk

  const purchases = paymentsOk ? snapshot.revenue.recent.filter((p) => inWindow(p.at, window)) : null
  const realThreads = input.support?.filter((t) => !t.isTester) ?? null
  const awaiting = realThreads
    ? realThreads.filter((t) => t.awaitingReply).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    : null

  const yesterday: FounderReport['yesterday'] = {
    newUsers: realUsers ? realUsers.filter((u) => inWindow(u.signedUpAt, window)).length : null,
    newUsersPreviousDay: realUsers ? realUsers.filter((u) => inWindow(u.signedUpAt, before)).length : null,
    payments: purchases ? { count: purchases.length, gross: purchases.reduce((sum, p) => sum + p.amount, 0) } : null,
    failedPayments: paymentsOk ? snapshot.revenue.failures.filter((at) => inWindow(at, window)).length : null,
    newSupportRequests: realThreads ? realThreads.filter((t) => inWindow(t.createdAt, window)).length : null,
  }

  const current: FounderReport['current'] = {
    active: realUsers ? realUsers.filter((u) => u.status === 'active').length : null,
    dormant: realUsers ? realUsers.filter((u) => u.status === 'dormant').length : null,
    pro: realUsers && !missing.has('Subscriptions') ? realUsers.filter((u) => u.plan !== 'free').length : null,
  }

  const support: FounderReport['support'] =
    realThreads && awaiting
      ? {
          open: realThreads.filter((t) => t.status === 'open').length,
          awaitingReply: awaiting.length,
          oldestWaitingDays: awaiting[0] ? daysSince(awaiting[0].createdAt, now) : null,
          needsAction: awaiting.slice(0, NEEDS_ACTION_LIMIT).map((t) => ({
            who: t.name ?? t.email ?? 'Unknown customer',
            title: t.title,
            waitingDays: daysSince(t.createdAt, now),
          })),
        }
      : null

  const health = [
    ...snapshot.attention.filter((a) => a.tone === 'critical').map((a) => a.title),
    ...snapshot.unavailable.map((label) => `${label} could not be loaded — related numbers may be missing.`),
    ...(input.support === null ? ['Support requests could not be loaded.'] : []),
  ]

  const quiet =
    yesterday.newUsers === 0 &&
    yesterday.payments?.count === 0 &&
    yesterday.failedPayments === 0 &&
    yesterday.newSupportRequests === 0 &&
    support?.awaitingReply === 0 &&
    health.length === 0

  return {
    window,
    shortLabel: formatReportDate(window, 'short'),
    longLabel: formatReportDate(window, 'long'),
    yesterday,
    current,
    support,
    health,
    quiet,
  }
}
