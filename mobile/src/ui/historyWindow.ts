import type { ResolvedPlanCap } from '../domain/planLimits'
import type { CivilDate } from '../domain/payPeriod'
import { manilaCivilDate } from '../domain/payPeriod'
import { OLDER_ENTRIES_LINE } from './copy'

export { OLDER_ENTRIES_LINE }

/** An entry dated exactly this many days ago is still visible. Older than that is hidden on Free. */
export const FREE_HISTORY_DAYS = 90

export function civilToIso(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function addCivilDays(date: CivilDate, delta: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day))
  utc.setUTCDate(utc.getUTCDate() + delta)
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

export function manilaToday(now: Date): string {
  return civilToIso(manilaCivilDate(now))
}

export function shiftIsoDate(iso: string, delta: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  return civilToIso(addCivilDays({ year, month, day }, delta))
}

/**
 * Pro, including lifetime and past-due grace, is stored under the name "Pro".
 * Signed-out phones and any other plan stay on the Free window.
 */
export function showsFreeHistory(plan: ResolvedPlanCap | null, signedIn: boolean): boolean {
  if (!signedIn) return true
  if (plan == null) return true
  return plan.name.trim().toLowerCase() !== 'pro'
}

export function historyCutoff(today: CivilDate): string {
  return civilToIso(addCivilDays(today, -FREE_HISTORY_DAYS))
}

export function isOlderThanFreeWindow(date: string, cutoff: string): boolean {
  return date < cutoff
}

export function entryReadOnly(date: string, free: boolean, cutoff: string | null): boolean {
  if (!free || cutoff == null) return false
  return isOlderThanFreeWindow(date, cutoff)
}

/** Entry dates cannot move past today, or before the Free cutoff when one applies. */
export function canShiftEntryDate(date: string, delta: number, today: string, cutoff: string | null): boolean {
  const next = shiftIsoDate(date, delta)
  if (next > today) return false
  if (cutoff != null && next < cutoff) return false
  return true
}
