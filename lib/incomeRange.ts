import { INCOME_RANGES } from '@/types/profile'

/** Map a monthly peso amount to the profile income-range enum used by completion scoring. */
export function monthlyIncomeToRange(amount: number | null | undefined): string | null {
  if (amount == null || Number.isNaN(amount) || amount < 0) return null
  if (amount < 20_000) return 'under_20k'
  if (amount < 50_000) return '20k_50k'
  if (amount < 100_000) return '50k_100k'
  if (amount < 200_000) return '100k_200k'
  return 'over_200k'
}

/** Midpoint estimate for a range (used when only range exists). */
export function incomeRangeToEstimate(range: string | null | undefined): number | null {
  if (!range) return null
  const map: Record<string, number> = {
    under_20k: 15_000,
    '20k_50k': 35_000,
    '50k_100k': 75_000,
    '100k_200k': 150_000,
    over_200k: 250_000,
  }
  return map[range] ?? null
}

export function isValidIncomeRange(value: string | null | undefined): boolean {
  if (!value) return false
  return INCOME_RANGES.some((r) => r.value === value && r.value !== '')
}
