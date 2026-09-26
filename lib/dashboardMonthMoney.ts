import { toLocalDateString } from '@/lib/format'

export type DashboardMonthMoney = {
  income: number
  expenses: number
  spendingByCategory: Record<string, number>
}

export const EMPTY_DASHBOARD_MONTH_MONEY: DashboardMonthMoney = {
  income: 0,
  expenses: 0,
  spendingByCategory: {},
}

/** Inclusive local-date range for a `YYYY-MM-01` month key. */
export function getMonthDateRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  return {
    start: toLocalDateString(new Date(y, (m ?? 1) - 1, 1)),
    end: toLocalDateString(new Date(y, m ?? 1, 0)),
  }
}

/** One month of income + expense rows → snapshot totals and per-category spending. */
export function summarizeDashboardMonth(
  incomeRows: ReadonlyArray<{ total_amount: number | string | null }>,
  expenseRows: ReadonlyArray<{ category: string | null; amount: number | string | null }>
): DashboardMonthMoney {
  const income = incomeRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const spendingByCategory: Record<string, number> = {}
  let expenses = 0
  for (const r of expenseRows) {
    const amount = Number(r.amount || 0)
    const cat = r.category || 'Other'
    spendingByCategory[cat] = (spendingByCategory[cat] ?? 0) + amount
    expenses += amount
  }
  return { income, expenses, spendingByCategory }
}
