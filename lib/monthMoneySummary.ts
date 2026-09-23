/**
 * Deterministic month money picture for KlaroPH.
 * Does not touch the database — callers pass summed monthly totals.
 *
 * Money left = income − allocated − spent (never subtracts planned).
 * Budget remaining = planned − spent (separate concept).
 */

export type BudgetHealthStatus = 'on_track' | 'watch' | 'over' | 'no_plan'

export type MonthMoneySummary = {
  income: number
  allocated: number
  disposable: number
  spent: number
  planned: number
  moneyLeft: number
  budgetRemaining: number
  /** planned > disposable */
  planExceedsDisposable: boolean
  health: BudgetHealthStatus
  /** 0–∞; usage as percent of planned (0 when no plan) */
  usagePct: number
}

export type MonthMoneySummaryInput = {
  income: number
  allocated: number
  spent: number
  planned: number
  /**
   * Fraction of the selected calendar month already elapsed (0–1).
   * Used only for Watch when spending is ahead of calendar pace.
   * Omit or pass undefined when pace is unknown.
   */
  monthProgress?: number
}

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

/**
 * Build the month money summary from already-aggregated totals.
 * Allocations must already be limited to income dated in the month (never counted as expenses).
 */
export function computeMonthMoneySummary(
  input: MonthMoneySummaryInput
): MonthMoneySummary {
  const income = toFiniteNumber(input.income)
  const allocated = Math.max(0, toFiniteNumber(input.allocated))
  const spent = toFiniteNumber(input.spent)
  const planned = Math.max(0, toFiniteNumber(input.planned))

  const disposable = income - allocated
  const moneyLeft = income - allocated - spent
  const budgetRemaining = planned - spent
  const usagePct = planned > 0 ? (spent / planned) * 100 : 0
  const health = resolveBudgetHealth({
    planned,
    spent,
    monthProgress: input.monthProgress,
  })

  return {
    income,
    allocated,
    disposable,
    spent,
    planned,
    moneyLeft,
    budgetRemaining,
    planExceedsDisposable: planned > disposable,
    health,
    usagePct,
  }
}
