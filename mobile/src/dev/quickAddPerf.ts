import type { KlaroRepository } from '../db/repository'
import { commitEntry } from '../ui/actions'
import { loadLedger, patchHome, type LedgerSnapshot } from '../ui/ledger'
import { newEntryDraft } from '../ui/quickAdd'

export type QuickAddSample = {
  median: number
  max: number
  times: number[]
  rows: number
}

/** One statement of local expenses, for the large-history harness. */
export function seedExpenses(repo: KlaroRepository, count: number, date: string): number {
  return repo.seedExpenses(count, date)
}

/**
 * Times `samples` quick adds against the current table.
 * Each sample writes one row and patches the on-screen totals. It does not reload the table.
 */
export function timeQuickAdds(repo: KlaroRepository, now: Date, samples: number): QuickAddSample {
  let view: LedgerSnapshot = loadLedger(repo, now)
  const times: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    const row = commitEntry(repo, { ...newEntryDraft(view.today, 'expense', null), amount: '12.50' }, now)
    view = patchHome(view, { type: 'insert', row })
    times.push(performance.now() - started)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length === 0
    ? 0
    : sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0)
  return {
    median,
    max: sorted[sorted.length - 1] ?? 0,
    times,
    rows: repo.countVisibleEntries(),
  }
}
