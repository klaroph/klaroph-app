import { roundMoney } from '../domain/money'
import { daysInMonth, type PayPeriod } from '../domain/payPeriod'
import { formatPeso } from './format'

export function inclusiveDays(start: string, end: string): number {
  const startMs = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)))
  const endMs = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)))
  return Math.round((endMs - startMs) / 86_400_000) + 1
}

/**
 * Monthly category budget for the payday period's month.
 * A month override replaces that category's plan. Categories with only an override still count.
 */
export function monthlyBudget(
  month: string,
  plans: readonly { category: string; amount: number }[],
  overrides: readonly { category: string; amount: number; month: string }[],
): { amount: number; hasRows: boolean } {
  const planAmounts = new Map<string, number>()
  for (const plan of plans) planAmounts.set(plan.category, plan.amount)
  const overrideAmounts = new Map<string, number>()
  for (const row of overrides) {
    if (row.month.slice(0, 7) === month) overrideAmounts.set(row.category, row.amount)
  }
  if (planAmounts.size === 0 && overrideAmounts.size === 0) return { amount: 0, hasRows: false }
  let total = 0
  for (const category of new Set([...planAmounts.keys(), ...overrideAmounts.keys()])) {
    total += overrideAmounts.get(category) ?? planAmounts.get(category) ?? 0
  }
  return { amount: roundMoney(total), hasRows: true }
}

/** The pay period's share of the monthly budget, by days in the period over days in that month. */
export function prorateToPeriod(amount: number, period: PayPeriod): number {
  const [year, month] = period.month.split('-').map(Number)
  const length = daysInMonth(year, month)
  return roundMoney((amount * inclusiveDays(period.start, period.end)) / length)
}

export function ringProgress(spent: number, budget: number | null): { progress: number; over: boolean } {
  if (budget == null) return { progress: 0, over: false }
  if (budget <= 0) return { progress: spent > 0 ? 1 : 0, over: spent > 0 }
  if (spent > budget) return { progress: 1, over: true }
  return { progress: spent / budget, over: false }
}

export function budgetPercent(spent: number, budget: number | null): number | null {
  if (budget == null || budget <= 0) return null
  return Math.round((spent / budget) * 100)
}

export function budgetRingLabel(spent: number, budget: number | null, over: boolean): string {
  if (budget == null) return `Spent ${formatPeso(spent)} this pay period. No budget yet.`
  if (over) return `Spent ${formatPeso(spent)} of ${formatPeso(budget)} this pay period. Over budget.`
  return `Spent ${formatPeso(spent)} of ${formatPeso(budget)} this pay period.`
}
