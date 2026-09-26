/**
 * Income source suggestion from description text.
 * Same whole-word matcher as expenses; maps only to INCOME_SOURCES.
 */

import { INCOME_SOURCES, type IncomeSource } from './incomeSources'
import { compilePhraseRules, scoreDescription, toSuggestionResult, type SuggestionResult } from './transactionDescription'

const RULES: { phrase: string; source: IncomeSource; weight: number }[] = [
  { phrase: 'salary', source: 'Salary', weight: 1 },
  { phrase: 'sahod', source: 'Salary', weight: 1 },
  { phrase: 'sweldo', source: 'Salary', weight: 1 },
  { phrase: 'suweldo', source: 'Salary', weight: 1 },
  { phrase: 'payroll', source: 'Salary', weight: 1 },
  { phrase: 'payslip', source: 'Salary', weight: 1 },
  { phrase: 'payday', source: 'Salary', weight: 0.9 },
  { phrase: 'kinsenas', source: 'Salary', weight: 0.9 },
  { phrase: '13th month', source: 'Bonus / 13th Month', weight: 1 },
  { phrase: 'thirteenth month', source: 'Bonus / 13th Month', weight: 1 },
  { phrase: 'bonus', source: 'Bonus / 13th Month', weight: 1 },
  { phrase: 'incentive', source: 'Bonus / 13th Month', weight: 0.7 },
  { phrase: 'freelance', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'freelancer', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'upwork', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'fiverr', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'onlinejobs', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'online job', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'virtual assistant', source: 'Freelance / Online Work', weight: 1 },
  { phrase: 'raket', source: 'Freelance / Online Work', weight: 0.9 },
  { phrase: 'sideline', source: 'Freelance / Online Work', weight: 0.8 },
  { phrase: 'client payment', source: 'Freelance / Online Work', weight: 0.8 },
  { phrase: 'business', source: 'Business Income', weight: 1 },
  { phrase: 'negosyo', source: 'Business Income', weight: 1 },
  { phrase: 'tindahan', source: 'Business Income', weight: 1 },
  { phrase: 'sari-sari', source: 'Business Income', weight: 0.9 },
  { phrase: 'benta', source: 'Business Income', weight: 0.9 },
  { phrase: 'online selling', source: 'Business Income', weight: 1 },
  { phrase: 'sales', source: 'Business Income', weight: 0.7 },
  { phrase: 'remittance', source: 'Remittance / Support', weight: 1 },
  { phrase: 'padala', source: 'Remittance / Support', weight: 1 },
  { phrase: 'ofw', source: 'Remittance / Support', weight: 0.9 },
  { phrase: 'allowance', source: 'Remittance / Support', weight: 0.7 },
  { phrase: 'dividend', source: 'Passive Income', weight: 1 },
  { phrase: 'interest', source: 'Passive Income', weight: 0.8 },
  { phrase: 'rental income', source: 'Passive Income', weight: 1 },
  { phrase: 'mp2', source: 'Passive Income', weight: 0.9 },
  { phrase: 'time deposit', source: 'Passive Income', weight: 0.9 },
  { phrase: 'royalty', source: 'Passive Income', weight: 1 },
  { phrase: 'gift', source: 'Gift / Refund', weight: 1 },
  { phrase: 'regalo', source: 'Gift / Refund', weight: 1 },
  { phrase: 'pamasko', source: 'Gift / Refund', weight: 1 },
  { phrase: 'ampao', source: 'Gift / Refund', weight: 1 },
  { phrase: 'angpao', source: 'Gift / Refund', weight: 1 },
  { phrase: 'refund', source: 'Gift / Refund', weight: 1 },
  { phrase: 'reimbursement', source: 'Gift / Refund', weight: 1 },
  { phrase: 'cashback', source: 'Gift / Refund', weight: 1 },
  { phrase: 'rebate', source: 'Gift / Refund', weight: 1 },
]

const VALID_SOURCES = new Set<string>(INCOME_SOURCES)

const COMPILED_RULES = compilePhraseRules(
  RULES.filter((r) => VALID_SOURCES.has(r.source)).map((r) => ({ phrase: r.phrase, value: r.source, weight: r.weight }))
)

export function suggestIncomeSourcesFromDescription(description: string): SuggestionResult {
  return toSuggestionResult(scoreDescription(description, COMPILED_RULES))
}
