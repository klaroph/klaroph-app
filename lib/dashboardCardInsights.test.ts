import { describe, it, expect } from 'vitest'
import { getNetWorthInsight, getTrendInsight } from './dashboardCardInsights'

describe('getTrendInsight', () => {
  it('flags rising expenses as negative', () => {
    const r = getTrendInsight([100, 100, 100], [100, 100, 120], 'Sep')
    expect(r).toEqual({ tone: 'negative', message: 'Expenses increased by about 20% over the last 3 months.' })
  })

  it('treats falling expenses as positive', () => {
    const r = getTrendInsight([100, 100, 100], [200, 150, 100], 'Sep')
    expect(r?.tone).toBe('positive')
    expect(r?.message).toBe('Expenses decreased by about 50% over the last 3 months.')
  })

  it('is positive when income grows faster than expenses', () => {
    const r = getTrendInsight([100, 120, 150], [100, 105, 110], 'Sep')
    expect(r?.tone).toBe('positive')
    expect(r?.message).toBe('Income grew about 50% while expenses grew 10% over the last 3 months.')
  })

  it('falls back to income change when expenses are flat', () => {
    expect(getTrendInsight([100, 90, 80], [100, 100, 100], 'Sep')?.tone).toBe('negative')
    expect(getTrendInsight([80, 90, 100], [100, 100, 100], 'Sep')?.tone).toBe('positive')
  })

  it('falls back to the latest month balance when nothing changed', () => {
    expect(getTrendInsight([100, 100, 100], [150, 150, 150], 'Sep')).toEqual({
      tone: 'negative',
      message: 'Expenses are higher than income in Sep.',
    })
    expect(getTrendInsight([150, 150, 150], [100, 100, 100], 'Sep')?.tone).toBe('positive')
  })

  it('returns null without enough data', () => {
    expect(getTrendInsight([0, 0, 0], [0, 0, 0], 'Sep')).toBeNull()
    expect(getTrendInsight([100, 100], [100, 100], 'Sep')).toBeNull()
  })
})

describe('getNetWorthInsight', () => {
  it('maps net worth to tone', () => {
    expect(getNetWorthInsight(200, 100, true).tone).toBe('positive')
    expect(getNetWorthInsight(100, 200, true).tone).toBe('negative')
    expect(getNetWorthInsight(100, 100, true).tone).toBe('neutral')
    expect(getNetWorthInsight(0, 0, false).tone).toBe('neutral')
  })
})
