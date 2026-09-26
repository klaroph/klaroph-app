import { describe, expect, it } from 'vitest'
import { suggestIncomeSourcesFromDescription } from './incomeSourceSuggestion'

describe('suggestIncomeSourcesFromDescription (deterministic)', () => {
  it.each([
    ['freelance payment', 'Freelance / Online Work'],
    ['Upwork client', 'Freelance / Online Work'],
    ['sahod', 'Salary'],
    ['13th month', 'Bonus / 13th Month'],
    ['padala from mama', 'Remittance / Support'],
    ['MP2 dividend', 'Passive Income'],
    ['refund from lazada', 'Gift / Refund'],
    ['benta sa tindahan', 'Business Income'],
  ])('%s → %s (high)', (text, source) => {
    expect(suggestIncomeSourcesFromDescription(text)).toEqual({ suggestions: [{ category: source }], confidence: 'high' })
  })

  it('does not use expense categories', () => {
    expect(suggestIncomeSourcesFromDescription('meralco bill').suggestions).toEqual([])
  })

  it.each(['GCash 1500', 'Transfer 2000'])('%s → no suggestion', (text) => {
    expect(suggestIncomeSourcesFromDescription(text).suggestions).toEqual([])
  })
})
