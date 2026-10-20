import { describe, expect, it } from 'vitest'
import { budgetsKeptFromAccountLine, movedToAccountLine } from './summary'

describe('budget merge summary', () => {
  it('pluralizes the account-wins line', () => {
    expect(budgetsKeptFromAccountLine(0)).toBeNull()
    expect(budgetsKeptFromAccountLine(1)).toBe('1 budget kept from your account')
    expect(budgetsKeptFromAccountLine(2)).toBe('2 budgets kept from your account')
  })

  it('counts entries and goals moved onto the account', () => {
    expect(movedToAccountLine(0, 0)).toBeNull()
    expect(movedToAccountLine(1, 1)).toBe('Moved 1 entry and 1 goal to your account.')
    expect(movedToAccountLine(2, 0)).toBe('Moved 2 entries and 0 goals to your account.')
  })
})
