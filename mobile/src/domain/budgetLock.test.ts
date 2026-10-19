import { describe, expect, it } from 'vitest'
import { BUDGET_LOCK_UPGRADE_MESSAGE, BUDGET_LOCKED, assertBudgetEditingAllowed, budgetEditingAllowed } from './budgetLock'
import { DomainError } from './errors'

const NOW = new Date('2026-10-19T00:00:00.000Z')

describe('free budget edit lock', () => {
  it('allows a free account through day 30 and locks on day 31', () => {
    expect(budgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: '2026-09-19T00:00:00.000Z',
      simulateExpired: false,
    }, NOW)).toBe(true)
    expect(budgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: '2026-09-18T00:00:00.000Z',
      simulateExpired: false,
    }, NOW)).toBe(false)
  })

  it('locks a missing or unreadable created_at and a simulated expiry', () => {
    expect(budgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: null,
      simulateExpired: false,
    }, NOW)).toBe(false)
    expect(budgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: 'not-a-date',
      simulateExpired: false,
    }, NOW)).toBe(false)
    expect(budgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: NOW.toISOString(),
      simulateExpired: true,
    }, NOW)).toBe(false)
  })

  it('keeps full budgeting open, including when expiry is simulated', () => {
    expect(budgetEditingAllowed({
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateExpired: true,
    }, NOW)).toBe(true)
  })

  it('throws the same upgrade message the web budget routes return', () => {
    expect(() => assertBudgetEditingAllowed({
      fullBudgeting: false,
      accountCreatedAt: '2026-09-18T00:00:00.000Z',
      simulateExpired: false,
    }, NOW)).toThrow(new DomainError(BUDGET_LOCKED, BUDGET_LOCK_UPGRADE_MESSAGE))
  })
})
