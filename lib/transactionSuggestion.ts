/**
 * Transaction suggestion entry point used by the expense and income forms.
 * Local and synchronous: normalization → ambiguity guard → deterministic matcher. No network, no AI.
 */

import { EXPENSE_CATEGORIES } from './expenseCategories'
import { INCOME_SOURCES } from './incomeSources'
import { suggestCategoriesFromDescription } from './expenseCategorySuggestion'
import { suggestIncomeSourcesFromDescription } from './incomeSourceSuggestion'
import { isAmbiguousDescription } from './transactionDescription'

export type TransactionKind = 'expense' | 'income'

const ALLOWED: Record<TransactionKind, Set<string>> = {
  expense: new Set(EXPENSE_CATEGORIES.map((c) => c.value)),
  income: new Set<string>(INCOME_SOURCES),
}

/**
 * Suggestion chips for a description: one value when confident, up to three when several fit,
 * none when the text names only a payment method, store, or amount ("GCash 1500").
 * Never selects anything; the form applies a chip only when the user clicks it.
 */
export function classifyTransactionDescription(kind: TransactionKind, description: string): string[] {
  if (!description.trim() || isAmbiguousDescription(description)) return []
  const result =
    kind === 'expense' ? suggestCategoriesFromDescription(description) : suggestIncomeSourcesFromDescription(description)
  return result.suggestions.map((s) => s.category).filter((value) => ALLOWED[kind].has(value))
}
