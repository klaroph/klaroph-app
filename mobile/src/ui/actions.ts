import type { KlaroRepository } from '../db/repository'
import type { ScreenPrefs } from './prefs'
import { DomainError } from '../domain/errors'
import { manilaCivilDate } from '../domain/payPeriod'
import { assertNever } from '../sync/assertNever'
import { expenseTypeFor, type EntryKind } from './categories'
import { FUTURE_DATE_MESSAGE, OLDER_ENTRIES_LINE } from './copy'
import { entryReadOnly, historyCutoff, manilaToday, showsFreeHistory } from './historyWindow'
import { historyRowFromSync, type HistoryRow } from './ledger'
import { parseQuickAmount, type EntryDraft } from './quickAdd'

function requireAmount(raw: string, label = 'amount'): number {
  const amount = parseQuickAmount(raw)
  if (amount == null) throw new DomainError('INVALID_AMOUNT', `Enter a ${label} greater than zero.`)
  return amount
}

function assertMutable(repo: KlaroRepository, date: string, now: Date): void {
  const today = manilaToday(now)
  if (date > today) throw new DomainError('FUTURE_DATE', FUTURE_DATE_MESSAGE)
  const free = showsFreeHistory(repo.knownPlan(), repo.sessionUserId() != null)
  const cutoff = free ? historyCutoff(manilaCivilDate(now)) : null
  if (entryReadOnly(date, free, cutoff)) throw new DomainError('ENTRY_READ_ONLY', OLDER_ENTRIES_LINE)
}

export function commitEntry(repo: KlaroRepository, draft: EntryDraft, now: Date): HistoryRow {
  const amount = requireAmount(draft.amount)
  if (draft.id) {
    const table = draft.kind === 'expense' ? 'expenses' : 'income_records'
    const current = repo.getRow(table, draft.id)
    if (!current || current.deleted_at) throw new DomainError('NOT_FOUND', 'Record not found.')
    assertMutable(repo, current.values.date ?? draft.date, now)
    assertMutable(repo, draft.date, now)
    switch (draft.kind) {
      case 'expense':
        return historyRowFromSync('expense', repo.updateExpense(draft.id, {
          category: draft.category,
          type: expenseTypeFor(draft.category, current.values.type),
          amount,
          date: draft.date,
          description: draft.description,
        }))
      case 'income':
        return historyRowFromSync('income', repo.updateIncome(draft.id, {
          totalAmount: amount,
          date: draft.date,
          incomeSource: draft.category || null,
        }))
      default:
        return assertNever(draft.kind)
    }
  }
  assertMutable(repo, draft.date, now)
  const userId = repo.sessionUserId()
  switch (draft.kind) {
    case 'expense':
      return historyRowFromSync('expense', repo.createExpense({
        userId,
        category: draft.category,
        type: expenseTypeFor(draft.category),
        amount,
        date: draft.date,
        description: draft.description.trim() ? draft.description : null,
      }))
    case 'income':
      return historyRowFromSync('income', repo.createIncome({
        userId,
        totalAmount: amount,
        date: draft.date,
        incomeSource: draft.category || null,
      }))
    default:
      return assertNever(draft.kind)
  }
}

export function commitDeleteEntry(repo: KlaroRepository, kind: EntryKind, id: string, now: Date): void {
  const table = kind === 'expense' ? 'expenses' : 'income_records'
  const current = repo.getRow(table, id)
  if (!current || current.deleted_at) throw new DomainError('NOT_FOUND', 'Record not found.')
  assertMutable(repo, current.values.date ?? '', now)
  switch (kind) {
    case 'expense':
      repo.softDeleteExpense(id)
      return
    case 'income':
      repo.softDeleteIncome(id)
      return
    default:
      return assertNever(kind)
  }
}

export function commitGoal(repo: KlaroRepository, input: { id?: string; name: string; target: string }): void {
  const target = requireAmount(input.target, 'target')
  if (input.id) {
    repo.updateGoal(input.id, { name: input.name, targetAmount: target })
    return
  }
  const userId = repo.sessionUserId()
  repo.createGoal({
    userId,
    name: input.name,
    targetAmount: target,
    maxGoals: userId == null ? undefined : repo.knownPlan()?.maxGoals,
  })
}

export function commitDeposit(repo: KlaroRepository, goalId: string, amountRaw: string): void {
  repo.createDeposit({
    userId: repo.sessionUserId(),
    goalId,
    amount: requireAmount(amountRaw),
  })
}

export function commitDeleteGoal(repo: KlaroRepository, id: string): void {
  repo.softDeleteGoal(id)
}

/** Stores one monthly amount on the phone. An empty amount clears it. Nothing is synced. */
export function commitMonthlyBudget(prefs: ScreenPrefs, raw: string): void {
  if (raw.trim() === '') {
    prefs.setMonthlyBudget(null)
    return
  }
  prefs.setMonthlyBudget(requireAmount(raw, 'budget'))
}
