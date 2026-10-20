import { roundMoney } from '../domain/money'
import { formatPrettyDate, formatWeekdayShort, signedPeso } from './format'
import type { EntryKind } from './categories'
import type { HistoryRow } from './ledger'

export type HistoryFilter = 'month' | 'expenses' | 'income' | 'window'

export type HistoryDay = {
  date: string
  title: string
  total: number
  totalLabel: string
  rows: HistoryRow[]
}

export function rowHeadline(row: { description: string; category: string; title: string }): string {
  const note = row.description.trim()
  if (note) return note
  const category = row.category.trim()
  if (category) return category
  return row.title
}

export function rowSignedAmount(row: { kind: EntryKind; amount: number }): number {
  switch (row.kind) {
    case 'expense':
      return -row.amount
    case 'income':
      return row.amount
    default: {
      const neverKind: never = row.kind
      return neverKind
    }
  }
}

export function dayHeaderTitle(date: string, today: string): string {
  const label = `${formatWeekdayShort(date).toUpperCase()}, ${formatPrettyDate(date).toUpperCase()}`
  if (date === today) return `TODAY · ${label}`
  return label
}

/** Newest day first. Rows inside a day keep the order they were given. */
export function groupHistoryByDay(rows: readonly HistoryRow[], today: string): HistoryDay[] {
  const order: string[] = []
  const buckets = new Map<string, HistoryRow[]>()
  for (const row of rows) {
    const list = buckets.get(row.date)
    if (list) list.push(row)
    else {
      buckets.set(row.date, [row])
      order.push(row.date)
    }
  }
  return order.map((date) => {
    const dayRows = buckets.get(date) ?? []
    const total = roundMoney(dayRows.reduce((sum, row) => sum + rowSignedAmount(row), 0))
    return {
      date,
      title: dayHeaderTitle(date, today),
      total,
      totalLabel: signedPeso(total),
      rows: dayRows,
    }
  })
}

export function filterHistoryRows(
  rows: readonly HistoryRow[],
  filter: HistoryFilter,
  query: string,
  month: { start: string; end: string } | null,
): HistoryRow[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    switch (filter) {
      case 'expenses':
        if (row.kind !== 'expense') return false
        break
      case 'income':
        if (row.kind !== 'income') return false
        break
      case 'month':
        if (month && (row.date < month.start || row.date > month.end)) return false
        break
      case 'window':
        break
      default: {
        const neverFilter: never = filter
        return neverFilter
      }
    }
    if (!needle) return true
    return `${row.description} ${row.category} ${row.title}`.toLowerCase().includes(needle)
  })
}
