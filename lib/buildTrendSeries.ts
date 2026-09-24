import { parseLocalDateString, toLocalDateString } from '@/lib/format'
import { formatTrendLabel } from '@/lib/transactionPeriod'

export type DatedAmount = { date: string; amount: number }

/**
 * Build a complete trend series for a date range + grouping from dated amounts.
 * Fills missing days/months/years with 0 so charts stay continuous.
 */
export function buildTrendSeries(
  rows: DatedAmount[],
  range: { start: string; end: string },
  trendGrouping: 'day' | 'month' | 'year'
): { labels: string[]; values: number[]; pairs: [string, number][] } {
  const trendMap = new Map<string, number>()
  for (const r of rows) {
    const key =
      trendGrouping === 'day'
        ? r.date
        : trendGrouping === 'month'
          ? r.date.slice(0, 7)
          : r.date.slice(0, 4)
    trendMap.set(key, (trendMap.get(key) ?? 0) + Number(r.amount))
  }

  let pairs: [string, number][]
  if (trendGrouping === 'day' && range.start && range.end) {
    const out: [string, number][] = []
    const start = parseLocalDateString(range.start)
    const end = parseLocalDateString(range.end)
    for (
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const key = toLocalDateString(d)
      out.push([key, trendMap.get(key) ?? 0])
    }
    pairs = out.sort((a, b) => a[0].localeCompare(b[0]))
  } else if (trendGrouping === 'month' && range.start && range.end) {
    const out: [string, number][] = []
    const [sy, sm] = range.start.slice(0, 7).split('-').map(Number)
    const [ey, em] = range.end.slice(0, 7).split('-').map(Number)
    for (let y = sy; y <= ey; y++) {
      const mStart = y === sy ? (sm ?? 1) : 1
      const mEnd = y === ey ? (em ?? 12) : 12
      for (let m = mStart; m <= mEnd; m++) {
        const key = `${y}-${String(m).padStart(2, '0')}`
        out.push([key, trendMap.get(key) ?? 0])
      }
    }
    pairs = out.sort((a, b) => a[0].localeCompare(b[0]))
  } else if (trendGrouping === 'year' && range.start && range.end) {
    const out: [string, number][] = []
    const sy = Number(range.start.slice(0, 4))
    const ey = Number(range.end.slice(0, 4))
    for (let y = sy; y <= ey; y++) {
      const key = String(y)
      out.push([key, trendMap.get(key) ?? 0])
    }
    pairs = out.sort((a, b) => a[0].localeCompare(b[0]))
  } else {
    pairs = Array.from(trendMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }

  return {
    pairs,
    labels: pairs.map(([key]) => formatTrendLabel(key, trendGrouping)),
    values: pairs.map(([, v]) => v),
  }
}

/** Collapse a long category/source list into top N + Others for charts. */
export function topNWithOthers<T extends { total: number }>(
  items: T[],
  labelKey: keyof T,
  n = 7
): { labels: string[]; values: number[] } {
  if (items.length <= n + 1) {
    return {
      labels: items.map((c) => String(c[labelKey])),
      values: items.map((c) => c.total),
    }
  }
  const top = items.slice(0, n)
  const rest = items.slice(n)
  const othersTotal = rest.reduce((s, c) => s + c.total, 0)
  return {
    labels: [...top.map((c) => String(c[labelKey])), 'Others'],
    values: [...top.map((c) => c.total), othersTotal],
  }
}
