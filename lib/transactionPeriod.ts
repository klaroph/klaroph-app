import { toLocalDateString } from '@/lib/format'

export type FilterPeriod =
  | 'this_week'
  | 'previous_week'
  | 'month'
  | 'previous_month'
  | 'quarter'
  | 'previous_quarter'
  | 'year'
  | 'previous_year'
  | 'all_time'
  | 'custom'

export const PERIOD_LABELS: Record<FilterPeriod, string> = {
  this_week: 'This Week',
  previous_week: 'Last Week',
  month: 'This Month',
  previous_month: 'Last Month',
  quarter: 'This Quarter',
  previous_quarter: 'Last Quarter',
  year: 'This Year',
  previous_year: 'Last Year',
  all_time: 'All Time',
  custom: 'Custom Range',
}

/** Periods that require Pro (unlimited history). */
export const PREMIUM_PERIODS = new Set<FilterPeriod>([
  'previous_quarter',
  'year',
  'previous_year',
  'all_time',
  'custom',
])

export const LOCKED_FILTER_TOOLTIP = 'Available in Pro — unlock unlimited history.'

export const FILTER_PERIOD_ORDER: FilterPeriod[] = [
  'this_week',
  'previous_week',
  'month',
  'previous_month',
  'quarter',
  'previous_quarter',
  'year',
  'previous_year',
  'all_time',
  'custom',
]

/** Returns { start, end } for the month whose first day is monthFirst (YYYY-MM-01). */
export function getMonthRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 0)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

export function getRange(
  period: FilterPeriod,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const dayOfWeek = now.getDay()
  switch (period) {
    case 'this_week': {
      const start = new Date(now)
      start.setDate(now.getDate() - dayOfWeek)
      return { start: toLocalDateString(start), end: toLocalDateString(now) }
    }
    case 'previous_week': {
      const end = new Date(now)
      end.setDate(now.getDate() - dayOfWeek - 1)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'month':
      return { start: toLocalDateString(new Date(y, m, 1)), end: toLocalDateString(new Date(y, m + 1, 0)) }
    case 'previous_month':
      return { start: toLocalDateString(new Date(y, m - 1, 1)), end: toLocalDateString(new Date(y, m, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3) * 3
      return { start: toLocalDateString(new Date(y, q, 1)), end: toLocalDateString(new Date(y, q + 3, 0)) }
    }
    case 'previous_quarter': {
      const q = Math.floor(m / 3) * 3 - 3
      const start = new Date(y, q, 1)
      const end = new Date(y, q + 3, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'year':
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    case 'previous_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case 'all_time':
      return { start: toLocalDateString(now), end: toLocalDateString(now) }
    case 'custom':
      return { start: customStart || `${y}-01-01`, end: customEnd || toLocalDateString(now) }
  }
}

export function getTrendGrouping(period: FilterPeriod): 'day' | 'month' | 'year' {
  if (period === 'year' || period === 'previous_year') return 'month'
  return 'day'
}

const dayLabelFmt = new Intl.DateTimeFormat('en-PH', { month: '2-digit', day: '2-digit' })
const monthLabelFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' })
const monthLongFmt = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })

export function formatMonthLabel(monthFirst: string): string {
  const [y, m] = monthFirst.split('-').map(Number)
  return monthLongFmt.format(new Date(y, (m ?? 1) - 1, 1))
}

export function formatTrendLabel(key: string, grouping: 'day' | 'month' | 'year'): string {
  if (grouping === 'day') {
    const [y, m, d] = key.split('-').map(Number)
    return dayLabelFmt.format(new Date(y, (m ?? 1) - 1, d ?? 1))
  }
  if (grouping === 'month') {
    const [y, m] = key.split('-').map(Number)
    return monthLabelFmt.format(new Date(y, (m ?? 1) - 1, 1))
  }
  return key
}
