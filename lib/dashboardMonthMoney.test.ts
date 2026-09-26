import { describe, expect, it } from 'vitest'
import { getMonthDateRange, summarizeDashboardMonth } from './dashboardMonthMoney'

describe('getMonthDateRange', () => {
  it('covers the whole month, including leap-year February', () => {
    expect(getMonthDateRange('2026-09-01')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(getMonthDateRange('2028-02-01')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(getMonthDateRange('2026-12-01')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
})

describe('summarizeDashboardMonth', () => {
  it('derives snapshot totals and budget spending from the same expense rows', () => {
    const result = summarizeDashboardMonth(
      [{ total_amount: 30000 }, { total_amount: '1500.50' }],
      [
        { category: 'food', amount: 1200 },
        { category: 'food', amount: '300.25' },
        { category: 'transport', amount: 500 },
      ]
    )
    expect(result.income).toBeCloseTo(31500.5)
    expect(result.expenses).toBeCloseTo(2000.25)
    expect(result.spendingByCategory).toEqual({ food: 1500.25, transport: 500 })
    const categoryTotal = Object.values(result.spendingByCategory).reduce((s, v) => s + v, 0)
    expect(categoryTotal).toBeCloseTo(result.expenses)
  })

  it('buckets uncategorized expenses as Other and treats null amounts as zero', () => {
    const result = summarizeDashboardMonth(
      [{ total_amount: null }],
      [
        { category: null, amount: 250 },
        { category: '', amount: null },
      ]
    )
    expect(result).toEqual({ income: 0, expenses: 250, spendingByCategory: { Other: 250 } })
  })

  it('returns zeros for an empty month', () => {
    expect(summarizeDashboardMonth([], [])).toEqual({ income: 0, expenses: 0, spendingByCategory: {} })
  })
})
