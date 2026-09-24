import { toLocalDateString } from '@/lib/format'

export type SnapshotExpenseRow = {
  category: string
  type: string
  amount: number
  date: string
}

export type SnapshotIncomeRow = {
  total_amount: number
  date: string
  income_source: string | null
}

export type DashboardSnapshot = {
  monthFirst: string
  monthStart: string
  monthEnd: string
  trendStart: string
  trendEnd: string
  monthExpenses: SnapshotExpenseRow[]
  monthIncome: SnapshotIncomeRow[]
  /** Last 6 calendar months of expenses (for trend chart). */
  trendExpenses: { amount: number; date: string }[]
}

export function getMonthBounds(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 0)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

export function getLast6MonthsTrendRange(now = new Date()): {
  start: string
  end: string
} {
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

export function spendingByCategoryFromExpenses(
  rows: { category: string; amount: number }[]
): Record<string, number> {
  const byCat: Record<string, number> = {}
  for (const row of rows) {
    const cat = row.category || 'Other'
    byCat[cat] = (byCat[cat] ?? 0) + Number(row.amount)
  }
  return byCat
}

/** Soft cap for unbounded list/export reads (power-user / all-time safety). */
export const TRANSACTION_PAGE_LIMIT = 2_000
export const EXPORT_PAGE_DEFAULT = 1_000
export const EXPORT_PAGE_MAX = 5_000
