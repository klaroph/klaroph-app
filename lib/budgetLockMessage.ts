/**
 * Single message shown when user hits budget editing lock (post 30-day trial).
 * Used by API 403 responses and by frontend when opening the upgrade modal from budget lock.
 */
export const BUDGET_LOCK_UPGRADE_MESSAGE =
  'Upgrade to continue managing budgets beyond 30 days.'

/** One short line beside the existing lock button. Does not replace the upgrade message. */
export const BUDGET_LOCK_STILL_FREE_LINE = 'Income, expenses, and goals still work.'

/**
 * Light notice while free budget editing is still allowed.
 * Names what stays free after the lock. Days left are included only when the trial clock is known.
 */
export function budgetTrialFreedomNotice(daysLeft: number | null | undefined): string {
  const base =
    'Income, expenses, and goals stay free after the 30-day budget lock. Budget editing needs Pro.'
  if (typeof daysLeft !== 'number' || !Number.isFinite(daysLeft) || daysLeft <= 0) return base
  const whole = Math.floor(daysLeft)
  const left = whole === 1 ? '1 day left.' : `${whole} days left.`
  return `${base} ${left}`
}
