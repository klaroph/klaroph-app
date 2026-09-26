/**
 * Ask Klaro hypothetical loan estimates. Parsing is pure; the payment math is the
 * shared Loan Calculator formula. Budget impact uses only the user's real Klaro figures.
 */

import { computeLoanAmortization } from '@/lib/loanAmortization'
import type { KlaroFinancialContext, SpendingCategoryRow } from '@/lib/ai/klaroFinancialContext'

export type LoanTerms = {
  principal: number | null
  annualRatePercent: number | null
  termMonths: number | null
}

export const LOAN_CATEGORY = 'Loan Payment'

const MAX_PRINCIPAL = 100_000_000
const MAX_ANNUAL_RATE = 200
const MAX_TERM_MONTHS = 600

/** "loan" plus common typos seen live ("lon", "laon", "loam"). */
const LOAN_WORD = /\b(loans?|lons?|laons?|loam|borrow\w*|amortization)\b/

/** "take out a loan for 20000 at 36%" — a new-loan estimate, not a question about the Loan Payment category. */
export function isLoanRequest(q: string): boolean {
  if (!LOAN_WORD.test(q)) return false
  if (/\bloan payments?\b/.test(q) && !/\b(take|taking|get|borrow\w*|apply|new)\b/.test(q)) return false
  return /\b(take out|takeout|taking out|takingout|take a|get a|getting a|borrow\w*|apply for|new loan|planning|thinking|looking to|want to|amortization|monthly|per month|interest|per annum)\b/.test(
    q
  )
}

function inRange(n: number, max: number): number | null {
  return Number.isFinite(n) && n > 0 && n <= max ? n : null
}

/** Extract principal / annual rate / term from a message. Missing values are null. */
export function parseLoanTerms(q: string): LoanTerms {
  let rest = q.toLowerCase()

  let annualRatePercent: number | null = null
  const rate = rest.match(/(\d+(?:\.\d+)?)\s*%\s*(per\s+month|a\s+month|monthly|\/\s*mo(nth)?)?/)
  if (rate) {
    const value = Number(rate[1]) * (rate[2] ? 12 : 1)
    annualRatePercent = value <= MAX_ANNUAL_RATE ? value : null
    rest = rest.replace(rate[0], ' ')
  }

  let termMonths: number | null = null
  const years = rest.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?)\b/)
  const months = rest.match(/(\d{1,3})\s*(months?|mos?)\b/)
  if (months) {
    termMonths = inRange(Number(months[1]), MAX_TERM_MONTHS)
    rest = rest.replace(months[0], ' ')
  } else if (years) {
    termMonths = inRange(Math.round(Number(years[1]) * 12), MAX_TERM_MONTHS)
    rest = rest.replace(years[0], ' ')
  }

  let principal: number | null = null
  const money = rest.match(/₱?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/)
  if (money) {
    const scale = money[2] === 'k' ? 1_000 : money[2] === 'm' ? 1_000_000 : 1
    principal = inRange(Number(money[1].replace(/,/g, '')) * scale, MAX_PRINCIPAL)
  }

  return { principal, annualRatePercent, termMonths }
}

/** Merge newer terms over older ones; a bare number fills the single missing field. */
export function mergeLoanTerms(prior: LoanTerms | null, reply: string): LoanTerms {
  const parsed = parseLoanTerms(reply)
  const merged: LoanTerms = {
    principal: parsed.principal ?? prior?.principal ?? null,
    annualRatePercent: parsed.annualRatePercent ?? prior?.annualRatePercent ?? null,
    termMonths: parsed.termMonths ?? prior?.termMonths ?? null,
  }
  // "12" answering "how many months?" is parsed as a principal; reassign it to the gap
  if (
    prior?.principal != null &&
    parsed.principal != null &&
    parsed.annualRatePercent == null &&
    parsed.termMonths == null &&
    /^\s*\d{1,3}\s*[?.!]*$/.test(reply)
  ) {
    merged.principal = prior.principal
    if (prior.termMonths == null) merged.termMonths = inRange(parsed.principal, MAX_TERM_MONTHS)
    else if (prior.annualRatePercent == null) merged.annualRatePercent = inRange(parsed.principal, MAX_ANNUAL_RATE)
  }
  return merged
}

export function missingLoanFields(t: LoanTerms): string[] {
  const missing: string[] = []
  if (t.principal == null) missing.push('the loan amount')
  if (t.annualRatePercent == null) missing.push('the interest rate')
  if (t.termMonths == null) missing.push('the repayment term (how many months)')
  return missing
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type LoanScenario = {
  principal: number
  annualRatePercent: number
  termMonths: number
  monthlyPayment: number
  totalInterest: number
  totalPayment: number
  periodLabel: string
  loanPaymentCategory: {
    spentThisPeriod: number
    budget: number | null
    projectedWithNewLoan: number
    projectedBudgetUsedPercent: number | null
  } | null
  overallBudget: {
    remaining: number
    overBudgetBy: number | null
    remainingAfterNewLoan: number
  } | null
  netFlowAfterNewLoan: number
  note: string
}

export function buildLoanScenario(params: {
  terms: Required<{ [K in keyof LoanTerms]: number }>
  context: KlaroFinancialContext
  loanCategory: SpendingCategoryRow | null
}): LoanScenario {
  const { terms, context, loanCategory } = params
  const a = computeLoanAmortization(terms.principal, terms.annualRatePercent, terms.termMonths)
  const monthly = round2(a.monthly)

  const budget = loanCategory?.budget != null && loanCategory.budget > 0 ? loanCategory.budget : null
  const projected = loanCategory ? round2(loanCategory.spent + monthly) : monthly

  return {
    principal: terms.principal,
    annualRatePercent: terms.annualRatePercent,
    termMonths: terms.termMonths,
    monthlyPayment: monthly,
    totalInterest: round2(a.totalInterest),
    totalPayment: round2(a.totalPayment),
    periodLabel: context.periodLabel,
    loanPaymentCategory: loanCategory
      ? {
          spentThisPeriod: loanCategory.spent,
          budget,
          projectedWithNewLoan: projected,
          projectedBudgetUsedPercent: budget ? Math.round((projected / budget) * 100) : null,
        }
      : null,
    overallBudget: context.budget
      ? {
          remaining: Math.max(0, context.budget.remaining),
          overBudgetBy: context.budget.remaining < 0 ? round2(-context.budget.remaining) : null,
          remainingAfterNewLoan: round2(context.budget.remaining - monthly),
        }
      : null,
    netFlowAfterNewLoan: round2(context.netFlow - monthly),
    note: 'Hypothetical estimate using the standard amortization formula (same as the KlaroPH Loan Calculator). Lender fees, insurance, and add-on charges are not included. Actual Klaro data was not changed.',
  }
}
