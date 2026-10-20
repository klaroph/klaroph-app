export const HISTORY_LOCKED = 'HISTORY_LOCKED'

export const HISTORY_LOCKED_MESSAGE = 'Entries older than 90 days are read-only on Free. Upgrade to edit them.'

const FREE_HISTORY_DAYS = 90

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * First day a Free user may pick. Same cutoff as `public.free_history_cutoff()`:
 * `(now() AT TIME ZONE 'Asia/Manila')::date - 90`. The device timezone is not used.
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

/**
 * `minimumDate` for a Free expense or income picker.
 * Pro, grace, and a plan that has not been resolved yet have no minimum.
 */
export function minimumSelectableHistoryDate(planName: string | null | undefined, now = new Date()): Date | undefined {
  if (planName !== 'Free') return undefined
  const cutoff = freeHistoryCutoffDate(now)
  const year = Number(cutoff.slice(0, 4))
  const month = Number(cutoff.slice(5, 7))
  const day = Number(cutoff.slice(8, 10))
  return new Date(year, month - 1, day)
}
