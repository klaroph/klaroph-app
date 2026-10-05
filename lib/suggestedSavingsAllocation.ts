/**
 * Suggested allocate amount from the profile savings preference.
 * Returns null when there is nothing useful to suggest. Never exceeds the income total.
 */
export function suggestedSavingsAllocation(
  incomeTotal: number,
  savingsPercent: number | null | undefined
): number | null {
  if (typeof savingsPercent !== 'number' || !Number.isFinite(savingsPercent) || savingsPercent <= 0) {
    return null
  }
  if (!Number.isFinite(incomeTotal) || incomeTotal <= 0) return null
  const pct = Math.min(100, savingsPercent)
  const amount = Math.round(((incomeTotal * pct) / 100) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.min(amount, incomeTotal)
}
