export const HISTORY_LOCKED = 'HISTORY_LOCKED'

export const HISTORY_LOCKED_MESSAGE = 'Entries older than 90 days are read-only on the Free plan.'

const FREE_HISTORY_DAYS = 90

/**
 * First day a Free user may pick. Same cutoff as
 * `(current_date - interval '90 days')::date` on the expenses and income SELECT policies.
 */
export function freeHistoryCutoffDate(now = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FREE_HISTORY_DAYS)
  const month = String(cutoff.getMonth() + 1).padStart(2, '0')
  const day = String(cutoff.getDate()).padStart(2, '0')
  return `${cutoff.getFullYear()}-${month}-${day}`
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
