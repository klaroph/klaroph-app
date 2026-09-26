import { describe, expect, it } from 'vitest'
import { summarizeGoals } from './goalsSummary'

const goals = [
  { id: 'a', name: 'Emergency fund', target_amount: 10000 },
  { id: 'b', name: 'Laptop', target_amount: 40000 },
  { id: 'c', name: 'Trip', target_amount: 5000 },
]

describe('summarizeGoals', () => {
  it('totals saved/target, counts goals, and picks the closest unfinished goal', () => {
    const summary = summarizeGoals(goals, { a: 6000, b: 4000, c: 5000 })
    expect(summary.totalSaved).toBe(15000)
    expect(summary.totalTarget).toBe(55000)
    expect(summary.activeGoals).toBe(3)
    expect(summary.overallPercent).toBeCloseTo((15000 / 55000) * 100)
    expect(summary.strongestGoal).toEqual({ name: 'Emergency fund', percent: 60 })
  })

  it('has no closest goal when every goal is complete, and caps overall progress at 100%', () => {
    const summary = summarizeGoals(goals.slice(0, 1), { a: 12000 })
    expect(summary.strongestGoal).toBeNull()
    expect(summary.overallPercent).toBe(100)
  })

  it('handles goals without allocations or targets', () => {
    const summary = summarizeGoals([{ id: 'z', name: 'Someday', target_amount: 0 }], {})
    expect(summary).toEqual({
      totalSaved: 0,
      totalTarget: 0,
      activeGoals: 1,
      overallPercent: 0,
      strongestGoal: { name: 'Someday', percent: 0 },
    })
  })
})
