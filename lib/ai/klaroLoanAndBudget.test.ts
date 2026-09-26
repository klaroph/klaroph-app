import { describe, it, expect } from 'vitest'
import { resolveDialogue, parseStoredResolution, type DialogueResolution } from './klaroDialogueResolver'
import { buildLoanScenario, isLoanRequest, mergeLoanTerms, parseLoanTerms } from './klaroLoanScenario'
import { buildChatFallback } from './klaroChatFallback'
import { buildClarifyFallback, isAcceptableClarification } from './klaroChatClarify'
import { selectChatContext } from './klaroChatIntent'
import { computeLoanAmortization } from '@/lib/loanAmortization'
import type { KlaroFinancialContext } from './klaroFinancialContext'

const PERIOD = '2026-09-01'

/** Figures from the live screenshot: 110% used, ₱14,739 OVER budget. */
function overBudgetContext(overrides: Partial<KlaroFinancialContext> = {}): KlaroFinancialContext {
  return {
    period: PERIOD,
    periodLabel: 'September 2026',
    income: 263548,
    expenses: 161322,
    netFlow: 102226,
    budget: { amount: 146583, spent: 161322, remaining: -14739, usedPercent: 110 },
    topSpendingCategories: [
      { name: 'Loan Payment', spent: 71668, budget: 70000, percentOfExpenses: 44 },
      { name: 'Family Support', spent: 24500, percentOfExpenses: 15 },
      { name: 'Groceries', spent: 22923, percentOfExpenses: 14 },
    ],
    goals: [{ name: 'Emergency Fund', targetAmount: 100000, currentAmount: 7000, progressPercent: 7 }],
    assets: 0,
    liabilities: 0,
    netWorth: 0,
    observationSeeds: [],
    ...overrides,
  }
}

function resolve(message: string, previous: DialogueResolution | null = null): DialogueResolution {
  return resolveDialogue({ message, history: [], previous, goalNames: ['Emergency Fund'], currentPeriod: PERIOD })
}

const SCREENSHOT_LOAN =
  'I am looking to take out a loan for 20000 at 36% per annum. How much will that be monthly and how my loan budget will look like?'

describe('Over-budget wording (live bug: "110% used, leaving about ₱14,739")', () => {
  it('general summary says OVER budget, never "leaving/remaining"', () => {
    const text = buildChatFallback({ message: 'how are we doing', context: overBudgetContext(), intent: 'general_summary' })
    expect(text).toContain('about ₱14,739 over budget')
    expect(text).not.toMatch(/leaving about ₱14,739|₱14,739 remaining/)
  })

  it('budget fallback says OVER budget', () => {
    const text = buildChatFallback({ message: 'how is my budget', context: overBudgetContext(), intent: 'budget' })
    expect(text).toContain('110%')
    expect(text).toContain('about ₱14,739 over budget')
    expect(text).not.toContain('₱14,739 remaining')
  })

  it('under-budget wording is unchanged', () => {
    const ctx = overBudgetContext({ budget: { amount: 146583, spent: 125699, remaining: 20884, usedPercent: 86 } })
    expect(buildChatFallback({ message: 'budget', context: ctx, intent: 'budget' })).toContain('with about ₱20,884 remaining')
  })

  it('Gemini context reports overBudgetBy instead of a negative remaining', () => {
    const compact = selectChatContext(overBudgetContext(), 'budget')
    expect(compact.budget).toMatchObject({ remaining: 0, overBudgetBy: 14739, utilizationPercent: 110 })
  })
})

describe('Loan questions (live bug: answered with a generic budget summary)', () => {
  it('the screenshot question is a loan request, not a budget question', () => {
    expect(isLoanRequest(SCREENSHOT_LOAN.toLowerCase())).toBe(true)
    expect(parseLoanTerms(SCREENSHOT_LOAN)).toEqual({ principal: 20000, annualRatePercent: 36, termMonths: null })
  })

  it('missing term → asks only for the term (no invented assumption)', () => {
    const r = resolve(SCREENSHOT_LOAN)
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.reason).toBe('loan_details')
    expect(r.choices).toEqual(['the repayment term (how many months)'])
    const q = buildClarifyFallback(r.reason, r.choices)
    expect(q).toContain('how many months')
    expect(isAcceptableClarification(q, r.reason, r.choices)).toBe(true)
  })

  it('reply "12 months" (or bare "12") completes the estimate', () => {
    const clarify = resolve(SCREENSHOT_LOAN)
    for (const reply of ['12 months', '12', '1 year']) {
      const r = resolve(reply, parseStoredResolution(JSON.parse(JSON.stringify(clarify))))
      expect(r).toMatchObject({
        action: 'answer',
        state: { intent: 'loan', loan: { principal: 20000, annualRatePercent: 36, termMonths: 12 } },
      })
    }
  })

  it('complete terms in one message answer directly; monthly rates convert to annual', () => {
    expect(resolve('Can I borrow ₱50k at 3% per month for 2 years?')).toMatchObject({
      action: 'answer',
      state: { intent: 'loan', loan: { principal: 50000, annualRatePercent: 36, termMonths: 24 } },
    })
  })

  it('"what about 24 months?" adjusts the previous estimate', () => {
    const prev = resolve(`${SCREENSHOT_LOAN} over 12 months`)
    expect(resolve('what about 24 months?', prev)).toMatchObject({
      action: 'answer',
      state: { intent: 'loan', loan: { principal: 20000, annualRatePercent: 36, termMonths: 24 } },
    })
  })

  it('questions about the existing Loan Payment category are not loan estimates', () => {
    expect(isLoanRequest('how much did i spend on loan payment?')).toBe(false)
  })

  it('uses the same amortization as the Loan Calculator and real Loan Payment budget figures', () => {
    const ctx = overBudgetContext()
    const s = buildLoanScenario({
      terms: { principal: 20000, annualRatePercent: 36, termMonths: 12 },
      context: ctx,
      loanCategory: ctx.topSpendingCategories[0],
    })
    const calc = computeLoanAmortization(20000, 36, 12)
    expect(s.monthlyPayment).toBe(Math.round(calc.monthly * 100) / 100)
    expect(s.monthlyPayment).toBeCloseTo(2009.24, 1)
    expect(s.loanPaymentCategory).toMatchObject({ spentThisPeriod: 71668, budget: 70000 })
    expect(s.overallBudget).toMatchObject({ remaining: 0, overBudgetBy: 14739 })

    const text = buildChatFallback({ message: SCREENSHOT_LOAN, context: ctx, intent: 'loan', loanScenario: s })
    expect(text).toContain('about ₱2,009 a month')
    expect(text).toContain('Loan Payment is at ₱71,668')
    expect(text).toContain('against a ₱70,000 budget')
    expect(text).toContain("already about ₱14,739 over your overall September 2026 budget")
    expect(text).toContain("wasn't changed")
    expect(text).not.toContain('Family Support') // not a generic budget summary
  })

  it('no Loan Payment budget → says so instead of inventing one', () => {
    const ctx = overBudgetContext()
    const s = buildLoanScenario({
      terms: { principal: 20000, annualRatePercent: 36, termMonths: 12 },
      context: ctx,
      loanCategory: { name: 'Loan Payment', spent: 71668, percentOfExpenses: 44 },
    })
    const text = buildChatFallback({ message: SCREENSHOT_LOAN, context: ctx, intent: 'loan', loanScenario: s })
    expect(text).toContain("doesn't have a Loan Payment budget set")
  })

  it('merge keeps prior terms when the reply adds one field', () => {
    expect(mergeLoanTerms({ principal: 20000, annualRatePercent: null, termMonths: 12 }, '36%')).toEqual({
      principal: 20000,
      annualRatePercent: 36,
      termMonths: 12,
    })
  })
})
