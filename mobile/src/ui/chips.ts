import { chipOptions, iconForCategory, type CategoryIconName, type EntryKind } from './categories'
import { formatPesoShort } from './format'
import type { HistoryRow } from './ledger'

export type CategoryUse = {
  kind: EntryKind
  category: string
}

/**
 * Most-used categories first. Equal counts keep the catalog order.
 * A category that is not in the catalog stays in front, matching `chipOptions`.
 */
export function orderCategoryChips(kind: EntryKind, current: string, uses: readonly CategoryUse[]): string[] {
  const counts = new Map<string, number>()
  for (const row of uses) {
    if (row.kind !== kind || row.category.trim() === '') continue
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }
  const base = chipOptions(kind, current)
  return base
    .map((name, index) => ({ name, index, count: counts.get(name) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((row) => row.name)
}

export type RepeatChip = {
  key: string
  kind: EntryKind
  category: string
  amount: number
  description: string
  label: string
  icon: CategoryIconName
}

export function repeatChipLabel(note: string, category: string, amount: number): string {
  const name = note.trim() || category || 'Entry'
  const short = name.length > 22 ? `${name.slice(0, 21)}…` : name
  return `${short} ${formatPesoShort(amount)}`
}

/** Newest unique amount + category + note, so one tap can log it again. */
export function repeatChips(rows: readonly HistoryRow[], limit = 6): RepeatChip[] {
  const seen = new Set<string>()
  const chips: RepeatChip[] = []
  for (const row of rows) {
    const description = row.description.trim()
    const key = `${row.kind}|${row.category}|${row.amount.toFixed(2)}|${description}`
    if (seen.has(key)) continue
    seen.add(key)
    chips.push({
      key,
      kind: row.kind,
      category: row.category,
      amount: row.amount,
      description,
      label: repeatChipLabel(description, row.category || row.title, row.amount),
      icon: row.icon || iconForCategory(row.category, row.kind),
    })
    if (chips.length >= limit) break
  }
  return chips
}
