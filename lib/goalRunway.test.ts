import { describe, it, expect } from 'vitest'
import {
  computeGoalRunway,
  formatGoalRunwayCopy,
  monthlyTotalsFromAllocations,
  recentContributionMonths,
} from './goalRunway'

describe('computeGoalRunway', () => {
  it('50k target / 20k saved / 5k monthly pace → about 6 months', () => {
    const runway = computeGoalRunway({
      target: 50000,
      saved: 20000,
      events: [
        { amount: 5000, incomeDate: '2026-07-15' },
        { amount: 5000, incomeDate: '2026-08-10' },
        { amount: 5000, incomeDate: '2026-09-05' },
      ],
    })
    expect(runway.status).toBe('estimate')
    expect(runway.remaining).toBe(30000)
    expect(runway.pace).toBe(5000)
    expect(runway.monthsRemaining).toBe(6)
    expect(runway.contributionMonthCount).toBe(3)
  })

  it('uses at most the 3 most recent contribution months for pace', () => {
    const runway = computeGoalRunway({
      target: 100000,
      saved: 40000,
      events: [
        { amount: 1000, incomeDate: '2026-01-01' },
        { amount: 1000, incomeDate: '2026-02-01' },
        { amount: 10000, incomeDate: '2026-07-01' },
        { amount: 10000, incomeDate: '2026-08-01' },
        { amount: 10000, incomeDate: '2026-09-01' },
      ],
    })
    // Pace from Jul/Aug/Sep only = 10000, not diluted by Jan/Feb
    expect(runway.pace).toBe(10000)
    expect(runway.contributionMonthCount).toBe(3)
    expect(runway.monthsRemaining).toBe(6) // 60000 / 10000
  })

  it('sums multiple allocations in the same income month', () => {
    const runway = computeGoalRunway({
      target: 12000,
      saved: 6000,
      events: [
        { amount: 2000, incomeDate: '2026-09-01' },
        { amount: 4000, incomeDate: '2026-09-20' },
      ],
    })
    expect(runway.contributionMonthCount).toBe(1)
    expect(runway.pace).toBe(6000)
    expect(runway.monthsRemaining).toBe(1)
  })

  it('returns no_pace when there are no contributions', () => {
    const runway = computeGoalRunway({
      target: 50000,
      saved: 0,
      events: [],
    })
    expect(runway.status).toBe('no_pace')
    expect(runway.monthsRemaining).toBeNull()
  })

  it('returns complete when saved >= target', () => {
    const runway = computeGoalRunway({
      target: 10000,
      saved: 10000,
      events: [{ amount: 10000, incomeDate: '2026-08-01' }],
    })
    expect(runway.status).toBe('complete')
    expect(runway.monthsRemaining).toBeNull()
  })

  it('still estimates from a single contribution month', () => {
    const runway = computeGoalRunway({
      target: 20000,
      saved: 5000,
      events: [{ amount: 5000, incomeDate: '2026-09-12' }],
    })
    expect(runway.status).toBe('estimate')
    expect(runway.contributionMonthCount).toBe(1)
    expect(runway.pace).toBe(5000)
    expect(runway.monthsRemaining).toBe(3)
  })
})

describe('monthlyTotalsFromAllocations / recentContributionMonths', () => {
  it('groups by YYYY-MM from income date', () => {
    const byMonth = monthlyTotalsFromAllocations([
      { amount: 100, incomeDate: '2026-09-01' },
      { amount: 50, incomeDate: '2026-09-15' },
      { amount: 200, incomeDate: '2026-08-01' },
    ])
    expect(byMonth['2026-09']).toBe(150)
    expect(byMonth['2026-08']).toBe(200)
    expect(recentContributionMonths(byMonth, 2).map((m) => m.month)).toEqual([
      '2026-09',
      '2026-08',
    ])
  })
})

describe('formatGoalRunwayCopy', () => {
  it('formats the 6-month example', () => {
    const copy = formatGoalRunwayCopy(
      computeGoalRunway({
        target: 50000,
        saved: 20000,
        events: [
          { amount: 5000, incomeDate: '2026-07-01' },
          { amount: 5000, incomeDate: '2026-08-01' },
          { amount: 5000, incomeDate: '2026-09-01' },
        ],
      })
    )
    expect(copy?.primary).toBe('About 6 months to go')
    expect(copy?.secondary).toContain('₱5,000/month')
  })

  it('notes when estimate is based on one contribution month', () => {
    const copy = formatGoalRunwayCopy(
      computeGoalRunway({
        target: 20000,
        saved: 5000,
        events: [{ amount: 5000, incomeDate: '2026-09-01' }],
      })
    )
    expect(copy?.secondary).toContain('one contribution month')
  })

  it('complete and no_pace messages', () => {
    expect(
      formatGoalRunwayCopy(
        computeGoalRunway({ target: 1000, saved: 1000, events: [] })
      )?.primary
    ).toBe('Goal reached')
    expect(
      formatGoalRunwayCopy(
        computeGoalRunway({ target: 1000, saved: 0, events: [] })
      )?.primary
    ).toContain('Start allocating income')
  })
})
