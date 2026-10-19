import { describe, expect, it } from 'vitest'
import { budgetsKeptFromAccountLine } from './summary'

describe('budget merge summary', () => {
  it('pluralizes the account-wins line', () => {
    expect(budgetsKeptFromAccountLine(0)).toBeNull()
    expect(budgetsKeptFromAccountLine(1)).toBe('1 budget kept from your account')
    expect(budgetsKeptFromAccountLine(2)).toBe('2 budgets kept from your account')
  })
})
