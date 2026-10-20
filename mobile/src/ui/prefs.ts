import { eq, like } from 'drizzle-orm'
import { moneyToText, roundMoney, textToMoney } from '../domain/money'
import type { KlaroDb } from '../db/repository'
import { localMeta } from '../db/schema'
import type { EntryKind } from './categories'
import { formatWholePeso } from './format'

const FIRST_RUN_KEY = 'ui.first_run_done'
const SYNC_ENABLED_KEY = 'ui.sync_enabled'
const PERIOD_BUDGET_PREFIX = 'ui.period_budget:'
const MONTHLY_BUDGET_KEY = 'ui.monthly_budget'
const NOTICE_KEY = 'ui.monthly_budget_notice'
const NOTICE_SEEN_KEY = 'ui.monthly_budget_notice_seen'
const MONTH_PREFIX = 'month:'

export type KeptDevicePrefs = {
  lastExpense: string | null
  lastIncome: string | null
  periodBudgets: readonly { start: string; amount: string }[]
  /** Raw `ui.monthly_budget` value, including the `month:` marker. */
  monthlyBudget: string | null
  budgetNotice: string | null
  budgetNoticeSeen: boolean
}

type StoredBudget = { period: 'month' | 'legacy'; amount: number }

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
    const parsed = parseStoredBudget(this.read(periodKey(periodStart)))
    if (parsed == null || parsed.period !== 'legacy') return null
    return parsed.amount
  }

  setPeriodBudget(periodStart: string, amount: number | null): void {
    this.write(periodKey(periodStart), amount == null ? null : moneyToText(amount))
  }

  /** Phone-only monthly amount. A marked record is never a payday-period total. */
  monthlyBudget(): number | null {
    const parsed = parseStoredBudget(this.read(MONTHLY_BUDGET_KEY))
    if (parsed?.period !== 'month') return null
    return parsed.amount
  }

  setMonthlyBudget(amount: number | null): void {
    if (amount == null) {
      this.write(MONTHLY_BUDGET_KEY, null)
      for (const row of this.periodRows()) this.write(periodKey(row.start), null)
      return
    }
    this.write(MONTHLY_BUDGET_KEY, markMonth(amount))
  }

  /**
   * Turns one locally stored payday-period amount into the monthly amount.
   * The converted value is stored as `month:<amount>` on that same row and on
   * `ui.monthly_budget`, so a later launch cannot double a record that is
   * already monthly. Category plans are not touched.
   */
  migratePaydayBudget(periodStart: string): { converted: boolean; amount: number | null } {
    const canonical = parseStoredBudget(this.read(MONTHLY_BUDGET_KEY))
    if (canonical?.period === 'month') return { converted: false, amount: canonical.amount }
    const chosen = this.choosePaydayBudget(periodStart)
    if (!chosen) return { converted: false, amount: null }
    const parsed = parseStoredBudget(chosen.raw)
    if (!parsed) return { converted: false, amount: null }
    if (parsed.period === 'month') {
      this.write(MONTHLY_BUDGET_KEY, markMonth(parsed.amount))
      return { converted: false, amount: parsed.amount }
    }
    const doubled = roundMoney(parsed.amount * 2)
    const marked = markMonth(doubled)
    this.write(MONTHLY_BUDGET_KEY, marked)
    this.write(periodKey(chosen.start), marked)
    if (this.read(NOTICE_SEEN_KEY) !== '1') this.write(NOTICE_KEY, moneyToText(doubled))
    return { converted: true, amount: doubled }
  }

  /** Shown once after a payday amount is doubled. Null once acknowledged. */
  monthlyBudgetNotice(): { amount: number; message: string } | null {
    if (this.read(NOTICE_SEEN_KEY) === '1') return null
    const raw = this.read(NOTICE_KEY)
    if (raw == null || raw.trim() === '') return null
    try {
      const amount = textToMoney(raw)
      return { amount, message: `Your budget is now monthly: ${formatWholePeso(amount)}` }
    } catch {
      return null
    }
  }

  acknowledgeMonthlyBudgetNotice(): void {
    this.write(NOTICE_SEEN_KEY, '1')
    this.write(NOTICE_KEY, null)
  }

  /** Phone-only prefs that sign-out would otherwise wipe with `local_meta`. */
  exportKeptPrefs(): KeptDevicePrefs {
    return {
      lastExpense: this.lastCategory('expense'),
      lastIncome: this.lastCategory('income'),
      periodBudgets: this.periodRows(),
      monthlyBudget: this.read(MONTHLY_BUDGET_KEY),
      budgetNotice: this.read(NOTICE_KEY),
      budgetNoticeSeen: this.read(NOTICE_SEEN_KEY) === '1',
    }
  }

  restoreKeptPrefs(kept: KeptDevicePrefs): void {
    if (kept.lastExpense) this.setLastCategory('expense', kept.lastExpense)
    if (kept.lastIncome) this.setLastCategory('income', kept.lastIncome)
    for (const row of kept.periodBudgets) this.write(periodKey(row.start), row.amount)
    if (kept.monthlyBudget) this.write(MONTHLY_BUDGET_KEY, kept.monthlyBudget)
    if (kept.budgetNotice) this.write(NOTICE_KEY, kept.budgetNotice)
    if (kept.budgetNoticeSeen) this.write(NOTICE_SEEN_KEY, '1')
  }

  private choosePaydayBudget(periodStart: string): { start: string; raw: string } | null {
    const rows = this.periodRows()
    if (rows.length === 0) return null
    const current = rows.find((row) => row.start === periodStart)
    if (current) return { start: current.start, raw: current.amount }
    const latest = [...rows].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))[0]
    return latest ? { start: latest.start, raw: latest.amount } : null
  }

  private periodRows(): { start: string; amount: string }[] {
    const rows = this.db.select().from(localMeta).where(like(localMeta.key, `${PERIOD_BUDGET_PREFIX}%`)).all()
    return rows.flatMap((row) => {
      const start = row.key.slice(PERIOD_BUDGET_PREFIX.length)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || row.value == null) return []
      return [{ start, amount: row.value }]
    })
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

function parseStoredBudget(raw: string | null): StoredBudget | null {
  if (raw == null || raw.trim() === '') return null
  const marked = raw.startsWith(MONTH_PREFIX)
  const text = marked ? raw.slice(MONTH_PREFIX.length) : raw
  try {
    const amount = textToMoney(text)
    if (!(amount >= 0)) return null
    return { period: marked ? 'month' : 'legacy', amount }
  } catch {
    return null
  }
}

function markMonth(amount: number): string {
  return `${MONTH_PREFIX}${moneyToText(amount)}`
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
