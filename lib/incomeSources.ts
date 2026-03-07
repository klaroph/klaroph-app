/** Preset income source options for dropdown. */
export const INCOME_SOURCES = [
  'Salary',
  'Bonus / 13th Month',
  'Freelance / Online Work',
  'Business Income',
  'Remittance / Support',
  'Passive Income',
  'Gift / Refund',
  'Other',
] as const

export type IncomeSource = (typeof INCOME_SOURCES)[number]
