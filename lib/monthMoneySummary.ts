/**
 * Budget health for KlaroPH.
 * Over = spent > planned. Watch = at least 90% used, or faster than the month's pace.
 */

export type BudgetHealthStatus = 'on_track' | 'watch' | 'over' | 'no_plan'

function toFiniteNumber(n: number): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

/**
 * Map existing BudgetOverview thresholds to a plain-language health status.
 * Does not invent new cutoffs: Over = spent > planned; Watch = ≥90% used or faster than month pace.
 */
export function resolveBudgetHealth(params: {
  planned: number
  spent: number
  monthProgress?: number
}): BudgetHealthStatus {
  const planned = toFiniteNumber(params.planned)
  const spent = toFiniteNumber(params.spent)

  if (planned <= 0) return 'no_plan'

  if (spent > planned) return 'over'

  const usagePct = (spent / planned) * 100
  const monthProgress =
    params.monthProgress != null && Number.isFinite(params.monthProgress)
      ? Math.min(1, Math.max(0, params.monthProgress))
      : undefined
  const spendingFasterThanTime =
    monthProgress != null ? usagePct > monthProgress * 100 : false

  if (usagePct >= 90 || spendingFasterThanTime) return 'watch'

  return 'on_track'
}

export function budgetHealthLabel(status: BudgetHealthStatus): string {
  switch (status) {
    case 'over':
      return 'Over'
    case 'watch':
      return 'Watch'
    case 'on_track':
      return 'On Track'
    case 'no_plan':
      return 'No Plan'
  }
}
