import type { KlaroRepository } from '../db/repository'
import { roundMoney } from '../domain/money'
import type { PayPeriod } from '../domain/payPeriod'
import { commitDeleteEntry } from './actions'
import type { EntryKind } from './categories'
import { formatPeso } from './format'

export function moneyLeft(budget: number | null, spent: number): number | null {
  if (budget == null) return null
  return roundMoney(budget - spent)
}

export function saveToastMessage(left: number | null): string {
  if (left == null) return 'Saved'
  return `Saved · ${formatPeso(left)} left until payday`
}

function countsTowardSpent(kind: EntryKind, date: string, period: PayPeriod): boolean {
  switch (kind) {
    case 'expense':
      return date >= period.start && date <= period.end
    case 'income':
      return false
    default: {
      const neverKind: never = kind
      return neverKind
    }
  }
}

/** Built in the same turn as the save. There is no delay before the message exists. */
export function toastForSave(input: {
  budget: number | null
  spentBefore: number
  row: { kind: EntryKind; amount: number; date: string }
  period: PayPeriod
}): { message: string; left: number | null } {
  const spent = countsTowardSpent(input.row.kind, input.row.date, input.period)
    ? input.spentBefore + input.row.amount
    : input.spentBefore
  const left = moneyLeft(input.budget, roundMoney(spent))
  return { message: saveToastMessage(left), left }
}

export function previewLeftAfter(left: number | null, kind: EntryKind, amount: number | null): number | null {
  if (left == null || amount == null) return null
  switch (kind) {
    case 'expense':
      return roundMoney(left - amount)
    case 'income':
      return left
    default: {
      const neverKind: never = kind
      return neverKind
    }
  }
}

/** Undo uses the same soft-delete the history screen uses, so sync still sees a tombstone. */
export function undoSavedEntry(repo: KlaroRepository, row: { kind: EntryKind; id: string }, now: Date): void {
  commitDeleteEntry(repo, row.kind, row.id, now)
}
