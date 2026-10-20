import { NextResponse } from 'next/server'
import { toLocalDateString } from '@/lib/format'

/** Same window as `(current_date - interval '90 days')::date` on the SELECT policies. */
export const FREE_HISTORY_DAYS = 90

export const HISTORY_LOCKED = 'HISTORY_LOCKED'

export const FREE_HISTORY_NOTICE = 'Entries older than 90 days are saved. Upgrade to Pro to see them.'

export const HISTORY_LOCKED_ERROR = 'Entries older than 90 days are read-only on the Free plan.'

type DbErrorLike = {
  message?: string | null
  details?: string | null
  code?: string | null
}

/**
 * First day a Free user may select. A row dated this day is still visible.
 * Matches the SELECT policy cutoff: date >= (current_date - interval '90 days')::date.
 */
export function freeHistoryCutoffDate(now = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FREE_HISTORY_DAYS)
  return toLocalDateString(cutoff)
}

export function isOlderThanFreeHistory(date: string, now = new Date()): boolean {
  return date.slice(0, 10) < freeHistoryCutoffDate(now)
}

export function historySkipMessage(skipped: number): string {
  return `${skipped} entries older than 90 days were skipped. Upgrade to Pro to import them.`
}

export function partitionFreeHistory<T extends { date: string }>(
  rows: readonly T[],
  isFree: boolean,
  now = new Date(),
): { keep: T[]; skipped: number } {
  if (!isFree) return { keep: [...rows], skipped: 0 }
  const cutoff = freeHistoryCutoffDate(now)
  const keep = rows.filter((row) => row.date.slice(0, 10) >= cutoff)
  return { keep, skipped: rows.length - keep.length }
}

export function isHistoryLockedError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false
  const text = `${error.message ?? ''}\n${error.details ?? ''}\n${error.code ?? ''}`
  return text.includes(HISTORY_LOCKED)
}

/** PostgREST `.single()` when the update matched nothing, including a row RLS hid. */
export function isMissingSingleRowError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST116') return true
  const text = `${error.message ?? ''}\n${error.details ?? ''}`
  return text.includes('0 rows') || text.includes('Cannot coerce')
}

export function historyLockedResponse(): NextResponse {
  return NextResponse.json({ error: HISTORY_LOCKED_ERROR, code: HISTORY_LOCKED }, { status: 403 })
}
