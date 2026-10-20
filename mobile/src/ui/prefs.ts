import { eq, like } from 'drizzle-orm'
import { moneyToText, textToMoney } from '../domain/money'
import type { KlaroDb } from '../db/repository'
import { localMeta } from '../db/schema'
import type { EntryKind } from './categories'

const FIRST_RUN_KEY = 'ui.first_run_done'
const SYNC_ENABLED_KEY = 'ui.sync_enabled'
const PERIOD_BUDGET_PREFIX = 'ui.period_budget:'

export type KeptDevicePrefs = {
  lastExpense: string | null
  lastIncome: string | null
  periodBudgets: ReadonlyArray<{ start: string; amount: string }>
}

/**
 * Screen preferences in the existing `local_meta` table.
 * Sign-out already clears that table. Callers that should keep the intro
 * write the flag back after sign-out.
 */
export class ScreenPrefs {
  constructor(private readonly db: KlaroDb) {}

  firstRunDone(): boolean {
    return this.read(FIRST_RUN_KEY) === '1'
  }

  setFirstRunDone(done = true): void {
    this.write(FIRST_RUN_KEY, done ? '1' : null)
  }

  /** Missing key means sync is on. */
  syncEnabled(): boolean {
    return this.read(SYNC_ENABLED_KEY) !== '0'
  }

  setSyncEnabled(enabled: boolean): void {
    this.write(SYNC_ENABLED_KEY, enabled ? null : '0')
  }

  lastCategory(kind: EntryKind): string | null {
    return this.read(categoryKey(kind))
  }

  setLastCategory(kind: EntryKind, category: string): void {
    const trimmed = category.trim()
    this.write(categoryKey(kind), trimmed.length > 0 ? trimmed : null)
  }

  /** One amount for a pay period, already the period total. Missing means unset. */
  periodBudget(periodStart: string): number | null {
    const raw = this.read(periodKey(periodStart))
    if (raw == null || raw.trim() === '') return null
    try {
      const amount = textToMoney(raw)
      if (!(amount >= 0)) return null
      return amount
    } catch {
      return null
    }
  }

  setPeriodBudget(periodStart: string, amount: number | null): void {
    this.write(periodKey(periodStart), amount == null ? null : moneyToText(amount))
  }

  /** Phone-only prefs that sign-out would otherwise wipe with `local_meta`. */
  exportKeptPrefs(): KeptDevicePrefs {
    const rows = this.db.select().from(localMeta).where(like(localMeta.key, `${PERIOD_BUDGET_PREFIX}%`)).all()
    return {
      lastExpense: this.lastCategory('expense'),
      lastIncome: this.lastCategory('income'),
      periodBudgets: rows.flatMap((row) => {
        const start = row.key.slice(PERIOD_BUDGET_PREFIX.length)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || row.value == null) return []
        return [{ start, amount: row.value }]
      }),
    }
  }

  restoreKeptPrefs(kept: KeptDevicePrefs): void {
    if (kept.lastExpense) this.setLastCategory('expense', kept.lastExpense)
    if (kept.lastIncome) this.setLastCategory('income', kept.lastIncome)
    for (const row of kept.periodBudgets) this.write(periodKey(row.start), row.amount)
  }

  private read(key: string): string | null {
    return this.db.select().from(localMeta).where(eq(localMeta.key, key)).get()?.value ?? null
  }

  private write(key: string, value: string | null): void {
    if (value == null) {
      this.db.delete(localMeta).where(eq(localMeta.key, key)).run()
      return
    }
    this.db
      .insert(localMeta)
      .values({ key, value })
      .onConflictDoUpdate({ target: localMeta.key, set: { value } })
      .run()
  }
}

function categoryKey(kind: EntryKind): string {
  switch (kind) {
    case 'expense':
      return 'ui.last_category:expense'
    case 'income':
      return 'ui.last_category:income'
    default: {
      const neverKind: never = kind
      return neverKind
    }
  }
}

function periodKey(periodStart: string): string {
  return `${PERIOD_BUDGET_PREFIX}${periodStart}`
}
