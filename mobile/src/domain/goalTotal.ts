import { parseMoney, roundMoney } from './money'

export type AllocationAmount = {
  amount: number | string
  deleted_at?: string | null
}

/**
 * Goal progress.
 * Sum live allocation rows when any exist. Otherwise use `saved_amount`.
 * The two are not added together. The app does not write `saved_amount`.
 */
export function goalProgressAmount(
  savedAmount: number | string,
  allocations: readonly AllocationAmount[],
): number {
  const live = allocations.filter((row) => row.deleted_at == null)
  if (live.length > 0) {
    return roundMoney(live.reduce((sum, row) => sum + parseMoney(row.amount), 0))
  }
  return parseMoney(savedAmount)
}
