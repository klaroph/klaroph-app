/**
 * Financial accounts: single-table schema (assets + liabilities).
 * Subtypes and labels for dashboard display.
 */

export const ASSET_SUBTYPES = [
  'cash_on_hand',
  'bank_account',
  'mp2_savings',
  'investment',
  'real_estate',
  'custom',
] as const

export const LIABILITY_SUBTYPES = [
  'credit_card',
  'personal_loan',
  'mortgage',
  'other',
] as const

export type AssetSubtype = (typeof ASSET_SUBTYPES)[number]
export type LiabilitySubtype = (typeof LIABILITY_SUBTYPES)[number]
export type FinancialAccountType = 'asset' | 'liability'

export type FinancialAccount = {
  id: string
  user_id: string
  type: FinancialAccountType
  subtype: string
  institution_name: string | null
  custom_name: string | null
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** Display labels for list and modals. Use subtype only; never infer from custom text. */
export const SUBTYPE_LABELS: Record<string, string> = {
  cash_on_hand: 'Cash on Hand',
  bank_account: 'Bank Account',
  mp2_savings: 'MP2 Savings',
  investment: 'Investment',
  real_estate: 'Real Estate',
  custom: 'Custom',
  credit_card: 'Credit Card',
  personal_loan: 'Personal Loan',
  mortgage: 'Mortgage',
  other: 'Other Liability',
}

export function getSubtypeLabel(subtype: string): string {
  return SUBTYPE_LABELS[subtype] ?? subtype
}

/** Display label for a row: subtype + optional institution/custom name */
export function getAccountDisplayLabel(account: {
  subtype: string
  institution_name?: string | null
  custom_name?: string | null
}): string {
  const sub = getSubtypeLabel(account.subtype)
  const extra = account.institution_name?.trim() || account.custom_name?.trim()
  return extra ? `${sub} — ${extra}` : sub
}

/** Liquidity weight for insight engine (0–1). */
export const LIQUIDITY_WEIGHTS: Record<string, number> = {
  cash_on_hand: 1,
  bank_account: 1,
  mp2_savings: 0.7,
  investment: 0.7,
  real_estate: 0.4,
  custom: 0.5,
}
