import { DEFAULT_EXPENSE_CATEGORY, DEFAULT_INCOME_SOURCE, type EntryKind } from './categories'

export type EntryDraft = {
  kind: EntryKind
  id?: string
  amount: string
  category: string
  date: string
  description: string
}

export function emptyDraft(today: string, kind: EntryKind = 'expense'): EntryDraft {
  return {
    kind,
    amount: '',
    category: kind === 'expense' ? DEFAULT_EXPENSE_CATEGORY : DEFAULT_INCOME_SOURCE,
    date: today,
    description: '',
  }
}

export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('').slice(0, 2)}`
}

export function parseQuickAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/[₱,\s]/g, '')
  if (!trimmed || trimmed === '.') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export function canSaveQuickAdd(draft: EntryDraft): boolean {
  return parseQuickAmount(draft.amount) != null && draft.category.trim().length > 0 && draft.date.length === 10
}
