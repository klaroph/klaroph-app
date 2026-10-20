import { roundMoney } from '../domain/money'
import { daysInMonth } from '../domain/payPeriod'
import { formatWholePeso } from './format'

/**
 * Monthly category budget for a Manila calendar month.
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

/** Inclusive Manila calendar month for a YYYY-MM-DD date. */
export function calendarMonth(isoDate: string): { month: string; start: string; end: string } {
  const year = Number(isoDate.slice(0, 4))
  const monthNumber = Number(isoDate.slice(5, 7))
  const month = isoDate.slice(0, 7)
  const last = daysInMonth(year, monthNumber)
  return {
    month,
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
  }
}

/** Days from the 1st through today in that Manila month, including today. */
export function elapsedDaysInMonth(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10))
  if (!Number.isFinite(day) || day < 1) return 0
  return day
}

/** Days from today through the last day of that Manila month, including today. */
export function daysLeftInMonth(isoDate: string): number {
  const last = Number(calendarMonth(isoDate).end.slice(8, 10))
  const day = Number(isoDate.slice(8, 10))
  return Math.max(last - day + 1, 0)
}

/**
 * Category budgets from the account are already the calendar month.
 * Otherwise the ring uses one monthly amount stored on the phone.
 */
export function ringBudget(
  category: { amount: number; hasRows: boolean },
  localMonthlyAmount: number | null,
): number | null {
  if (category.hasRows) return roundMoney(category.amount)
  if (localMonthlyAmount == null) return null
  return roundMoney(localMonthlyAmount)
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

/**
 * Whole pesos of the month remainder.
 * Money still left rounds to the nearest peso. An over amount rounds up, so 500.50 over is 501.
 * The sign is negative only when the rounded over amount is at least one peso.
 */
export function displayMonthRemainder(left: number): number {
  const cents = roundMoney(left)
  if (cents < 0) return -Math.ceil(Math.abs(cents))
  return Math.round(cents)
}

/** Whole pesos of the month remainder. Below zero uses the absolute value and "over". */
export function monthBudgetLine(left: number, isoDate: string): string {
  const whole = displayMonthRemainder(left)
  const money = formatWholePeso(Math.abs(whole))
  const days = daysLeftInMonth(isoDate)
  const noun = days === 1 ? 'day' : 'days'
  const side = `${days} ${noun} left`
  if (whole < 0) return `${money} over this month · ${side}`
  return `${money} left this month · ${side}`
}

export function budgetRingLabel(spent: number, budget: number | null, over: boolean): string {
  const spentLabel = formatWholePeso(spent)
  if (budget == null) return `Spent ${spentLabel} this month. No budget yet.`
  const budgetLabel = formatWholePeso(budget)
  if (over) return `Spent ${spentLabel} of ${budgetLabel} this month. Over budget.`
  return `Spent ${spentLabel} of ${budgetLabel} this month.`
}
