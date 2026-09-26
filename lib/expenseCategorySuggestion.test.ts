import { describe, expect, it } from 'vitest'
import { suggestCategoriesFromDescription } from './expenseCategorySuggestion'
import { EXPENSE_CATEGORIES } from './expenseCategories'

const top = (text: string) => suggestCategoriesFromDescription(text)

describe('suggestCategoriesFromDescription (deterministic)', () => {
  it.each([
    ['meralco bill', 'Utilities'],
    ['Paid Meralco Bill!!', 'Utilities'],
    ['jeep to work', 'Transportation'],
    ['jeep to office', 'Transportation'],
    ['grab ride to office', 'Transportation'],
    ['palengke', 'Groceries'],
    ['groceries', 'Groceries'],
    ['tuition', 'Education'],
    ['tuition payment', 'Education'],
    ['school supplies', 'Education'],
    ['dentist cleaning', 'Health'],
    ['water bill', 'Utilities'],
    ['grab food', 'Dining Out'],
    ['foodpanda', 'Dining Out'],
    ['toll autosweep', 'Transportation'],
  ])('%s → %s (high)', (text, category) => {
    expect(top(text)).toEqual({ suggestions: [{ category }], confidence: 'high' })
  })

  it('matches whole words only', () => {
    expect(top('shampoo').suggestions).toEqual([])
    expect(top('business lunch').suggestions.map((s) => s.category)).not.toContain('Entertainment')
    expect(top('current account').suggestions.map((s) => s.category)).not.toContain('Rent / Mortgage')
  })

  it('handles simple plurals', () => {
    expect(top('bills meralco').suggestions[0]?.category).toBe('Utilities')
    expect(top('mcdonalds').suggestions[0]?.category).toBe('Dining Out')
  })

  it('keeps genuinely ambiguous words as multiple chips, not one confident guess', () => {
    const result = top('grab')
    expect(result.confidence).toBe('medium')
    expect(result.suggestions.map((s) => s.category).sort()).toEqual(['Dining Out', 'Transportation'])
  })

  it.each(['GCash 1500', 'Cash 500', 'Transfer 2000'])('%s → no suggestion', (text) => {
    expect(top(text)).toEqual({ suggestions: [], confidence: 'low' })
  })

  it('only returns existing categories', () => {
    const valid = new Set(EXPENSE_CATEGORIES.map((c) => c.value))
    for (const text of ['jeepney padala internet', 'sari-sari canteen', 'lab test vitamins']) {
      for (const s of top(text).suggestions) expect(valid.has(s.category)).toBe(true)
    }
  })
})
