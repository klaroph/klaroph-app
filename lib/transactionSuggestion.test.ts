import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyTransactionDescription } from './transactionSuggestion'
import { EXPENSE_CATEGORIES, getTypeForCategory } from './expenseCategories'
import { INCOME_SOURCES } from './incomeSources'

vi.mock('@/lib/ai/gemini', () => ({
  generateGeminiText: vi.fn(() => {
    throw new Error('transaction suggestions must not call Gemini')
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('classifyTransactionDescription — expense', () => {
  it.each([
    ['meralco bill', 'Utilities'],
    ['jeep to work', 'Transportation'],
    ['palengke', 'Groceries'],
    ['tuition', 'Education'],
    ['paid meralco through gcash', 'Utilities'],
    ['grab ride to office', 'Transportation'],
    ['dentist cleaning', 'Health'],
  ])('%s → %s', (text, category) => {
    expect(classifyTransactionDescription('expense', text)).toEqual([category])
  })

  it.each([
    ['kuryente', 'Utilities'],
    ['botika', 'Health'],
    ['matrikula', 'Education'],
    ['padala', 'Family Support'],
    ['pamasahe', 'Transportation'],
    ['karinderya', 'Dining Out'],
  ])('Filipino keyword %s → %s', (text, category) => {
    expect(classifyTransactionDescription('expense', text)).toEqual([category])
  })

  it('normalizes case, punctuation and spacing', () => {
    expect(classifyTransactionDescription('expense', '  PAID   Meralco-Bill!! ')).toEqual(['Utilities'])
  })

  it.each(['GCash 1500', 'Cash 500', 'Transfer 2000', 'Payment 1000', 'SM 1500', 'Grab 500', '   ', ''])(
    '%j → no suggestion',
    (text) => {
      expect(classifyTransactionDescription('expense', text)).toEqual([])
    }
  )

  it('returns nothing for text it does not recognise instead of guessing', () => {
    expect(classifyTransactionDescription('expense', 'birthday for kuya')).toEqual([])
  })

  it('only returns existing categories, whose needs/wants type comes from the category definitions', () => {
    const valid = new Map(EXPENSE_CATEGORIES.map((c) => [c.value, c.type]))
    for (const text of ['jeepney', 'foodpanda', 'netflix', 'lab test', 'shopee', 'hotel', 'water bill', 'lunch']) {
      for (const category of classifyTransactionDescription('expense', text)) {
        expect(valid.has(category)).toBe(true)
        expect(getTypeForCategory(category)).toBe(valid.get(category))
      }
    }
  })
})

describe('classifyTransactionDescription — income', () => {
  it.each([
    ['freelance payment', 'Freelance / Online Work'],
    ['sahod', 'Salary'],
    ['pamasko', 'Gift / Refund'],
    ['padala from abroad', 'Remittance / Support'],
  ])('%s → %s', (text, source) => {
    expect(classifyTransactionDescription('income', text)).toEqual([source])
  })

  it('never returns expense categories for income', () => {
    const valid = new Set<string>(INCOME_SOURCES)
    for (const text of ['meralco bill', 'groceries', 'freelance', 'bonus', 'dividend']) {
      for (const source of classifyTransactionDescription('income', text)) expect(valid.has(source)).toBe(true)
    }
    expect(classifyTransactionDescription('income', 'meralco bill')).toEqual([])
  })

  it.each(['GCash 1500', 'Transfer 2000'])('%s → no suggestion', (text) => {
    expect(classifyTransactionDescription('income', text)).toEqual([])
  })
})

describe('classifyTransactionDescription — local only', () => {
  it('makes no network or Gemini calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { generateGeminiText } = await import('@/lib/ai/gemini')
    for (const text of ['meralco bill', 'birthday dinner with family', 'GCash 1500', 'freelance payment']) {
      classifyTransactionDescription('expense', text)
      classifyTransactionDescription('income', text)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(generateGeminiText).not.toHaveBeenCalled()
  })

  it('returns synchronously', () => {
    expect(Array.isArray(classifyTransactionDescription('expense', 'meralco bill'))).toBe(true)
  })

  it('is advisory only: same input gives the same chips and nothing is selected', () => {
    const first = classifyTransactionDescription('expense', 'grab food')
    first.push('Shopping')
    expect(classifyTransactionDescription('expense', 'grab food')).toEqual(['Dining Out'])
  })
})
