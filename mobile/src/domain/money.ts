import { DomainError } from './errors'

export const MAX_MONEY = 1_000_000_000_000

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function parseMoney(value: number | string, label = 'amount'): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new DomainError('INVALID_AMOUNT', `Enter a valid ${label}.`)
  }
  return roundMoney(numeric)
}

/** Decimal text stored in SQLite and safe to send as a Postgres numeric. */
export function moneyToText(value: number): string {
  return roundMoney(value).toFixed(2)
}

export function textToMoney(value: string): number {
  return parseMoney(value)
}

export function assertPositiveMoney(value: number, label = 'amount'): number {
  const amount = roundMoney(value)
  if (!(amount > 0)) {
    throw new DomainError('INVALID_AMOUNT', `Enter a ${label} greater than zero.`)
  }
  if (amount > MAX_MONEY) {
    throw new DomainError('INVALID_AMOUNT', `${label} is too large.`)
  }
  return amount
}

export function assertNonNegativeMoney(value: number, label = 'amount'): number {
  const amount = roundMoney(value)
  if (amount < 0 || amount > MAX_MONEY) {
    throw new DomainError('INVALID_AMOUNT', `Enter a valid ${label}.`)
  }
  return amount
}
