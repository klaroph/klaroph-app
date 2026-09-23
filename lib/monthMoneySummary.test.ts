import { describe, it, expect } from 'vitest'
import {
  computeMonthMoneySummary,
  resolveBudgetHealth,
  budgetHealthLabel,
} from './monthMoneySummary'

describe('computeMonthMoneySummary', () => {
  it('matches the canonical 30k / 5k / 20k / 12k example', () => {
    const s = computeMonthMoneySummary({
      income: 30000,
      allocated: 5000,
      spent: 12000,
      planned: 20000,
      monthProgress: 0.5,
    })
    expect(s.income).toBe(30000)
    expect(s.allocated).toBe(5000)
    expect(s.disposable).toBe(25000)
    expect(s.spent).toBe(12000)
    expect(s.planned).toBe(20000)
    expect(s.moneyLeft).toBe(13000)
    expect(s.budgetRemaining).toBe(8000)
    // Does NOT subtract planned from moneyLeft
    expect(s.moneyLeft).not.toBe(30000 - 5000 - 20000 - 12000)
  })

  it('handles no income (money left can be negative from expenses)', () => {
    const s = computeMonthMoneySummary({
      income: 0,
      allocated: 0,
      spent: 4000,
      planned: 0,
    })
    expect(s.moneyLeft).toBe(-4000)
    expect(s.disposable).toBe(0)
    expect(s.health).toBe('no_plan')
  })

  it('income with no expenses → money left equals disposable', () => {
    const s = computeMonthMoneySummary({
      income: 20000,
      allocated: 3000,
      spent: 0,
      planned: 10000,
    })
    expect(s.disposable).toBe(17000)
    expect(s.moneyLeft).toBe(17000)
    expect(s.budgetRemaining).toBe(10000)
  })

  it('expenses with no budget → money left still works', () => {
    const s = computeMonthMoneySummary({
      income: 10000,
      allocated: 0,
      spent: 2500,
      planned: 0,
    })
    expect(s.moneyLeft).toBe(7500)
    expect(s.budgetRemaining).toBe(-2500)
    expect(s.health).toBe('no_plan')
  })

  it('budget with no expenses → full plan remaining', () => {
    const s = computeMonthMoneySummary({
      income: 15000,
      allocated: 0,
      spent: 0,
      planned: 8000,
      monthProgress: 0.2,
    })
    expect(s.moneyLeft).toBe(15000)
    expect(s.budgetRemaining).toBe(8000)
    expect(s.health).toBe('on_track')
  })

  it('does not clamp negative money left', () => {
    const s = computeMonthMoneySummary({
      income: 5000,
      allocated: 1000,
      spent: 8000,
      planned: 4000,
    })
    expect(s.moneyLeft).toBe(-4000)
  })

  it('sums multiple income records and allocations (caller aggregates)', () => {
    const income = 10000 + 15000 + 5000
    const allocated = 2000 + 1000 + 500
    const s = computeMonthMoneySummary({
      income,
      allocated,
      spent: 9000,
      planned: 12000,
    })
    expect(s.income).toBe(30000)
    expect(s.allocated).toBe(3500)
    expect(s.disposable).toBe(26500)
    expect(s.moneyLeft).toBe(17500)
  })

  it('zero allocations → set aside 0, disposable = income', () => {
    const s = computeMonthMoneySummary({
      income: 12000,
      allocated: 0,
      spent: 3000,
      planned: 5000,
    })
    expect(s.allocated).toBe(0)
    expect(s.disposable).toBe(12000)
    expect(s.moneyLeft).toBe(9000)
  })

  it('goal allocation is not treated as an expense (spent is independent)', () => {
    const s = computeMonthMoneySummary({
      income: 10000,
      allocated: 4000,
      spent: 2000,
      planned: 5000,
    })
    // If allocation were wrongly added to spent, moneyLeft would be 4000
    expect(s.moneyLeft).toBe(4000)
    expect(s.spent).toBe(2000)
    expect(s.allocated).toBe(4000)
  })

  it('flags when planned exceeds disposable without changing moneyLeft', () => {
    const s = computeMonthMoneySummary({
      income: 20000,
      allocated: 5000,
      spent: 3000,
      planned: 18000,
    })
    expect(s.disposable).toBe(15000)
    expect(s.planExceedsDisposable).toBe(true)
    expect(s.moneyLeft).toBe(12000)
  })

  it('expenses greater than budget → over health and negative budgetRemaining', () => {
    const s = computeMonthMoneySummary({
      income: 20000,
      allocated: 0,
      spent: 15000,
      planned: 10000,
      monthProgress: 0.5,
    })
    expect(s.budgetRemaining).toBe(-5000)
    expect(s.health).toBe('over')
    expect(s.moneyLeft).toBe(5000)
  })
})

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
