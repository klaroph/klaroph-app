import type { KlaroRepository } from '../db/repository'
import { parseMoney, roundMoney } from '../domain/money'
import { payPeriodAt, type PayHalf, type PayPeriod } from '../domain/payPeriod'
import { FREE_PLAN_MAX_GOALS, goalCapMessage } from '../domain/planLimits'
import type { SyncRow, SyncedTable } from '../sync/model'
import { monthlyBudget, ringBudget, ringProgress } from './budgetMath'
import { iconForCategory, type CategoryIconName, type EntryKind } from './categories'
import { formatPeriodRange, formatPeso, formatPrettyDate } from './format'
import { historyCutoff, manilaToday, showsFreeHistory } from './historyWindow'

export const HISTORY_PAGE_SIZE = 40

export type HistoryCursor = {
  date: string
  createdAt: string
  id: string
}

export type HistoryRow = {
  id: string
  kind: EntryKind
  date: string
  createdAt: string
  amount: number
  title: string
  category: string
  description: string
  icon: CategoryIconName
  amountLabel: string
  dateLabel: string
  detail: string
}

export type GoalCard = {
  id: string
  name: string
  progress: number
  target: number
  percent: number
  pinnedAt: string | null
  progressLabel: string
  percentLabel: string
}

export type DatedCount = { date: string; count: number }
export type CategoryTotal = { name: string; amount: number }

export type LedgerSnapshot = {
  today: string
  freeHistory: boolean
  cutoff: string | null
  olderLineVisible: boolean
  period: PayPeriod
  halfLabel: string
  periodRange: string
  spent: number
  incomeTotal: number
  budget: number | null
  ring: number
  overBudget: boolean
  daysLogged: number
  topCategory: { name: string; amount: number; icon: CategoryIconName } | null
  goalPercent: number | null
  goalName: string | null
  recent: HistoryRow[]
  goals: GoalCard[]
  grace: boolean
  capMessage: string | null
  expenseTotals: CategoryTotal[]
  dateCounts: DatedCount[]
}

export type HistoryPage = {
  rows: HistoryRow[]
  cursor: HistoryCursor | null
  hasMore: boolean
}

export type EntryChange =
  | { type: 'insert'; row: HistoryRow }
  | { type: 'update'; row: HistoryRow; previous: HistoryRow }
  | { type: 'delete'; previous: HistoryRow }

function deviceRows(repo: KlaroRepository, table: SyncedTable): SyncRow[] {
  const userId = repo.sessionUserId()
  if (!userId) return repo.listLive(table, null)
  return [...repo.listLive(table, userId), ...repo.listLive(table, null)]
}

function text(row: SyncRow, key: string): string {
  return row.values[key] ?? ''
}

function money(row: SyncRow, key: string): number {
  const value = row.values[key]
  if (value == null || value === '') return 0
  return parseMoney(value)
}

function inPeriod(date: string, period: PayPeriod): boolean {
  return date >= period.start && date <= period.end
}

function halfLabel(half: PayHalf): string {
  switch (half) {
    case 'a':
      return '1st half'
    case 'b':
      return '2nd half'
    default: {
      const neverHalf: never = half
      return neverHalf
    }
  }
}

export function historyRowFromSync(kind: EntryKind, row: SyncRow): HistoryRow {
  if (kind === 'expense') {
    const category = text(row, 'category')
    const type = text(row, 'type')
    return {
      id: row.id,
      kind,
      date: text(row, 'date'),
      createdAt: row.created_at,
      amount: money(row, 'amount'),
      title: category,
      category,
      description: text(row, 'description'),
      icon: iconForCategory(category, 'expense'),
      amountLabel: formatPeso(money(row, 'amount')),
      dateLabel: formatPrettyDate(text(row, 'date')),
      detail: type === 'wants' ? 'Want' : 'Need',
    }
  }
  const source = text(row, 'income_source')
  const amount = money(row, 'total_amount')
  return {
    id: row.id,
    kind,
    date: text(row, 'date'),
    createdAt: row.created_at,
    amount,
    title: source || 'Income',
    category: source,
    description: '',
    icon: iconForCategory(source, 'income'),
    amountLabel: `+${formatPeso(amount)}`,
    dateLabel: formatPrettyDate(text(row, 'date')),
    detail: 'Income',
  }
}

function historyRowFromPage(row: {
  id: string
  kind: string
  date: string
  createdAt: string
  amount: string
  category: string
  description: string
  detail: string
}): HistoryRow {
  if (row.kind === 'income') {
    const source = row.category
    const amount = parseMoney(row.amount || '0')
    return {
      id: row.id,
      kind: 'income',
      date: row.date,
      createdAt: row.createdAt,
      amount,
      title: source || 'Income',
      category: source,
      description: '',
      icon: iconForCategory(source, 'income'),
      amountLabel: `+${formatPeso(amount)}`,
      dateLabel: formatPrettyDate(row.date),
      detail: 'Income',
    }
  }
  const amount = parseMoney(row.amount || '0')
  return {
    id: row.id,
    kind: 'expense',
    date: row.date,
    createdAt: row.createdAt,
    amount,
    title: row.category,
    category: row.category,
    description: row.description,
    icon: iconForCategory(row.category, 'expense'),
    amountLabel: formatPeso(amount),
    dateLabel: formatPrettyDate(row.date),
    detail: row.detail === 'wants' ? 'Want' : 'Need',
  }
}

export function byRecent(a: HistoryRow, b: HistoryRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : -1
}

function featuredGoal(goals: readonly GoalCard[]): GoalCard | null {
  if (goals.length === 0) return null
  const pinned = goals
    .filter((goal) => goal.pinnedAt != null)
    .sort((a, b) => (a.pinnedAt ?? '').localeCompare(b.pinnedAt ?? ''))
  if (pinned.length > 0) return pinned[pinned.length - 1]
  return [...goals].sort((a, b) => a.name.localeCompare(b.name))[0]
}

function topCategory(totals: readonly CategoryTotal[]): LedgerSnapshot['topCategory'] {
  const ranked = [...totals].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const top = ranked[0]
  if (!top || top.amount <= 0) return null
  return { name: top.name, amount: roundMoney(top.amount), icon: iconForCategory(top.name, 'expense') }
}

function windowFor(repo: KlaroRepository, now: Date): { today: string; freeHistory: boolean; cutoff: string | null; minDate: string | null } {
  const today = manilaToday(now)
  const signedIn = repo.sessionUserId() != null
  const freeHistory = showsFreeHistory(repo.knownPlan(), signedIn)
  const cutoff = freeHistory
    ? historyCutoff({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) })
    : null
  return { today, freeHistory, cutoff, minDate: cutoff }
}

export function hasUnsyncedChanges(repo: KlaroRepository): boolean {
  return repo.countUnsyncedRows() > 0
}

export function pageHistory(
  repo: KlaroRepository,
  now: Date,
  before: HistoryCursor | null,
  limit = HISTORY_PAGE_SIZE,
): HistoryPage {
  const { minDate } = windowFor(repo, now)
  const rows = repo.pageEntries({ minDate, limit, before }).map(historyRowFromPage)
  const last = rows[rows.length - 1]
  return {
    rows,
    cursor: last ? { date: last.date, createdAt: last.createdAt, id: last.id } : before,
    hasMore: rows.length === limit,
  }
}

export function loadLedger(repo: KlaroRepository, now: Date, localPeriodBudget: number | null = null): LedgerSnapshot {
  const { today, freeHistory, cutoff, minDate } = windowFor(repo, now)
  const period = payPeriodAt(now)
  const stats = repo.periodStats(period.start, period.end, minDate)
  const olderLineVisible = freeHistory && cutoff != null && repo.hasVisibleBefore(cutoff)
  const budgetRows = monthlyBudget(
    period.month,
    deviceRows(repo, 'budget_plans').map((row) => ({ category: text(row, 'category'), amount: money(row, 'amount') })),
    deviceRows(repo, 'budget_overrides').map((row) => ({
      category: text(row, 'category'),
      amount: money(row, 'amount'),
      month: text(row, 'month'),
    })),
  )
  const budget = ringBudget(budgetRows, period, localPeriodBudget)
  const spent = roundMoney(stats.spent)
  const incomeTotal = roundMoney(stats.income)
  const ring = ringProgress(spent, budget)
  const expenseTotals = stats.categories.map((row) => ({ name: row.name, amount: roundMoney(row.amount) }))
  const dateCounts = stats.dates.map((row) => ({ date: row.date, count: row.count }))
  const recent = pageHistory(repo, now, null, 5).rows

  const signedIn = repo.sessionUserId() != null
  const goalRows = deviceRows(repo, 'goals')
  const goals: GoalCard[] = goalRows.map((row) => {
    const target = money(row, 'target_amount')
    const progress = repo.goalProgress(row.id)
    const percent = target > 0 ? Math.round((progress / target) * 100) : 0
    return {
      id: row.id,
      name: text(row, 'name'),
      progress,
      target,
      percent,
      pinnedAt: row.values.pinned_at ?? null,
      progressLabel: `${formatPeso(progress)} of ${formatPeso(target)}`,
      percentLabel: `${percent}%`,
    }
  }).sort((a, b) => {
    if ((a.pinnedAt == null) !== (b.pinnedAt == null)) return a.pinnedAt == null ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  const featured = featuredGoal(goals)
  const plan = signedIn ? repo.knownPlan() : null
  const maxGoals = plan?.maxGoals ?? FREE_PLAN_MAX_GOALS
  const grace = repo.goalCreatesBlocked()
  const capMessage = !grace && goalRows.length >= maxGoals ? goalCapMessage(plan) : null

  return {
    today,
    freeHistory,
    cutoff,
    olderLineVisible,
    period,
    halfLabel: halfLabel(period.half),
    periodRange: formatPeriodRange(period.start, period.end),
    spent,
    incomeTotal,
    budget,
    ring: ring.progress,
    overBudget: ring.over,
    daysLogged: dateCounts.length,
    topCategory: topCategory(expenseTotals),
    goalPercent: featured ? featured.percent : null,
    goalName: featured ? featured.name : null,
    recent,
    goals,
    grace,
    capMessage,
    expenseTotals,
    dateCounts,
  }
}

function bumpDate(counts: DatedCount[], date: string, delta: number): DatedCount[] {
  const next = counts.map((item) => ({ ...item }))
  const found = next.find((item) => item.date === date)
  if (found) found.count += delta
  else if (delta > 0) next.push({ date, count: delta })
  return next.filter((item) => item.count > 0)
}

function bumpCategory(totals: CategoryTotal[], name: string, delta: number): CategoryTotal[] {
  const next = totals.map((item) => ({ ...item }))
  const found = next.find((item) => item.name === name)
  if (found) found.amount = roundMoney(found.amount + delta)
  else if (delta > 0) next.push({ name, amount: roundMoney(delta) })
  return next.filter((item) => item.amount > 0)
}

function fold(view: LedgerSnapshot, row: HistoryRow, sign: 1 | -1): Pick<LedgerSnapshot, 'spent' | 'incomeTotal' | 'expenseTotals' | 'dateCounts'> {
  if (!inPeriod(row.date, view.period)) {
    return {
      spent: view.spent,
      incomeTotal: view.incomeTotal,
      expenseTotals: view.expenseTotals,
      dateCounts: view.dateCounts,
    }
  }
  const dateCounts = bumpDate(view.dateCounts, row.date, sign)
  if (row.kind === 'expense') {
    return {
      spent: roundMoney(view.spent + sign * row.amount),
      incomeTotal: view.incomeTotal,
      expenseTotals: bumpCategory(view.expenseTotals, row.category, sign * row.amount),
      dateCounts,
    }
  }
  if (row.kind === 'income') {
    return {
      spent: view.spent,
      incomeTotal: roundMoney(view.incomeTotal + sign * row.amount),
      expenseTotals: view.expenseTotals,
      dateCounts,
    }
  }
  const neverKind: never = row.kind
  return neverKind
}

function nextRecent(view: LedgerSnapshot, change: EntryChange, refill: HistoryRow[] | undefined): HistoryRow[] {
  if (refill) return refill
  if (change.type === 'delete') {
    return view.recent.filter((row) => row.id !== change.previous.id || row.kind !== change.previous.kind)
  }
  const without = view.recent.filter((row) => row.id !== change.row.id || row.kind !== change.row.kind)
  return [...without, change.row].sort(byRecent).slice(0, 5)
}

/** Updates the pay-period card from the one row that changed. */
export function patchHome(view: LedgerSnapshot, change: EntryChange, refillRecent?: HistoryRow[]): LedgerSnapshot {
  let next = view
  if (change.type === 'update' || change.type === 'delete') next = { ...next, ...fold(next, change.previous, -1) }
  if (change.type === 'insert' || change.type === 'update') next = { ...next, ...fold(next, change.row, 1) }
  const ring = ringProgress(next.spent, next.budget)
  return {
    ...next,
    ring: ring.progress,
    overBudget: ring.over,
    daysLogged: next.dateCounts.length,
    topCategory: topCategory(next.expenseTotals),
    recent: nextRecent(view, change, refillRecent),
  }
}

/** Keeps the loaded history pages in order without reading the rest of the table. */
export function applyHistoryChange(rows: HistoryRow[], change: EntryChange, hasMore: boolean): HistoryRow[] {
  if (change.type === 'delete') {
    return rows.filter((row) => row.id !== change.previous.id || row.kind !== change.previous.kind)
  }
  const without = rows.filter((row) => row.id !== change.row.id || row.kind !== change.row.kind)
  if (change.type === 'insert' && hasMore && rows.length > 0) {
    const oldest = rows[rows.length - 1]
    if (oldest && byRecent(change.row, oldest) > 0) return rows
  }
  return [...without, change.row].sort(byRecent)
}
