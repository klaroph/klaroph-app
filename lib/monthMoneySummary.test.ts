import { describe, it, expect } from 'vitest'
import { resolveBudgetHealth, budgetHealthLabel } from './monthMoneySummary'

describe('resolveBudgetHealth', () => {
  it('returns no_plan when planned is zero', () => {
    expect(resolveBudgetHealth({ planned: 0, spent: 0 })).toBe('no_plan')
    expect(resolveBudgetHealth({ planned: 0, spent: 100 })).toBe('no_plan')
  })

  it('returns over when spent exceeds planned', () => {
    expect(resolveBudgetHealth({ planned: 1000, spent: 1001 })).toBe('over')
  })

  it('returns watch at >= 90% usage', () => {
    expect(
      resolveBudgetHealth({ planned: 1000, spent: 900, monthProgress: 0.95 })
    ).toBe('watch')
  })

  it('returns watch when spending is faster than month pace', () => {
    // 50% of budget used but only 20% of month elapsed
    expect(
      resolveBudgetHealth({ planned: 1000, spent: 500, monthProgress: 0.2 })
    ).toBe('watch')
  })

  it('returns on_track when within plan and not ahead of pace', () => {
    expect(
      resolveBudgetHealth({ planned: 1000, spent: 400, monthProgress: 0.5 })
    ).toBe('on_track')
  })
})

describe('budgetHealthLabel', () => {
  it('maps statuses to plain labels', () => {
    expect(budgetHealthLabel('on_track')).toBe('On Track')
    expect(budgetHealthLabel('watch')).toBe('Watch')
    expect(budgetHealthLabel('over')).toBe('Over')
    expect(budgetHealthLabel('no_plan')).toBe('No Plan')
  })
})
