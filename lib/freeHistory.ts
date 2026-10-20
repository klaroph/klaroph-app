import { NextResponse } from 'next/server'

/** Same window as `public.free_history_cutoff()`: Manila's calendar date minus 90 days. */
export const FREE_HISTORY_DAYS = 90

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export const HISTORY_LOCKED = 'HISTORY_LOCKED'

export const FREE_HISTORY_NOTICE = 'Entries older than 90 days are saved. Upgrade to Pro to see them.'

export const HISTORY_LOCKED_ERROR = 'Entries older than 90 days are read-only on Free. Upgrade to edit them.'

type DbErrorLike = {
  message?: string | null
  details?: string | null
  code?: string | null
}

/**
 * First day a Free user may select. A row dated this day is still visible.
 * Matches `public.free_history_cutoff()`: `(now() AT TIME ZONE 'Asia/Manila')::date - 90`.
 * The device timezone is not used.
 */
export function freeHistoryCutoffDate(now = new Date()): string {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS)
  const cutoff = new Date(Date.UTC(
    manila.getUTCFullYear(),
    manila.getUTCMonth(),
    manila.getUTCDate() - FREE_HISTORY_DAYS,
  ))
  const month = String(cutoff.getUTCMonth() + 1).padStart(2, '0')
  const day = String(cutoff.getUTCDate()).padStart(2, '0')
  return `${cutoff.getUTCFullYear()}-${month}-${day}`
}

export function isOlderThanFreeHistory(date: string, now = new Date()): boolean {
  return date.slice(0, 10) < freeHistoryCutoffDate(now)
}

export function historySkipMessage(skipped: number): string {
  const entry = skipped === 1 ? 'entry' : 'entries'
  const verb = skipped === 1 ? 'was' : 'were'
  return `${skipped} ${entry} older than 90 days ${verb} skipped. Upgrade to Pro to import them.`
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
