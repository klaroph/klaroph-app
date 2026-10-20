import type { KlaroRepository } from '../db/repository'
import { roundMoney } from '../domain/money'
import { commitDeleteEntry } from './actions'
import type { EntryKind } from './categories'
import { formatWholePeso } from './format'

export function moneyLeft(budget: number | null, spent: number): number | null {
  if (budget == null) return null
  return roundMoney(budget - spent)
}

export function saveToastMessage(left: number | null): string {
  if (left == null) return 'Saved'
  const whole = Math.round(left)
  if (whole < 0) return `Saved · ${formatWholePeso(Math.abs(whole))} over this month`
  return `Saved · ${formatWholePeso(whole)} left this month`
}

function countsTowardSpent(kind: EntryKind, date: string, month: { start: string; end: string }): boolean {
  switch (kind) {
    case 'expense':
      return date >= month.start && date <= month.end
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
  month: { start: string; end: string }
}): { message: string; left: number | null } {
  const spent = countsTowardSpent(input.row.kind, input.row.date, input.month)
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
