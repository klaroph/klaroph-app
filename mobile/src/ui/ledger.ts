import type { KlaroRepository } from '../db/repository'
import { parseMoney, roundMoney } from '../domain/money'
import { payPeriodAt, type PayHalf, type PayPeriod } from '../domain/payPeriod'
import { FREE_PLAN_MAX_GOALS } from '../domain/planLimits'
import type { SyncRow, SyncedTable } from '../sync/model'
import { monthlyBudget, ringBudget, ringProgress } from './budgetMath'
import { iconForCategory, type CategoryIconName, type EntryKind } from './categories'
import { LOCAL_GOAL_CAP_MESSAGE } from './copy'
import { formatPeriodRange, formatPeso, formatPrettyDate } from './format'
import { entryReadOnly, historyCutoff, isOlderThanFreeWindow, manilaToday, showsFreeHistory } from './historyWindow'

export type HistoryRow = {
  id: string
  kind: EntryKind
  date: string
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
  history: HistoryRow[]
  goals: GoalCard[]
  grace: boolean
  capMessage: string | null
}

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

function historyRow(kind: EntryKind, row: SyncRow): HistoryRow {
  if (kind === 'expense') {
    const category = text(row, 'category')
    const type = text(row, 'type')
    return {
      id: row.id,
      kind,
      date: text(row, 'date'),
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

function byRecent(a: HistoryRow, b: HistoryRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
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

export function hasUnsyncedChanges(repo: KlaroRepository): boolean {
  return repo.countUnsyncedRows() > 0
}

export function loadLedger(repo: KlaroRepository, now: Date, localPeriodBudget: number | null = null): LedgerSnapshot {
  const today = manilaToday(now)
  const signedIn = repo.sessionUserId() != null
  const freeHistory = showsFreeHistory(repo.knownPlan(), signedIn)
  const cutoff = freeHistory ? historyCutoff({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) }) : null
  const period = payPeriodAt(now)

  const expenses = deviceRows(repo, 'expenses').map((row) => historyRow('expense', row))
  const income = deviceRows(repo, 'income_records').map((row) => historyRow('income', row))
  const olderLineVisible = freeHistory && cutoff != null && [...expenses, ...income].some((row) => isOlderThanFreeWindow(row.date, cutoff))
  const visible = [...expenses, ...income]
    .filter((row) => !entryReadOnly(row.date, freeHistory, cutoff))
    .sort(byRecent)

  const periodExpenses = visible.filter((row) => row.kind === 'expense' && inPeriod(row.date, period))
  const periodIncome = visible.filter((row) => row.kind === 'income' && inPeriod(row.date, period))
  const spent = roundMoney(periodExpenses.reduce((sum, row) => sum + row.amount, 0))
  const incomeTotal = roundMoney(periodIncome.reduce((sum, row) => sum + row.amount, 0))

  const plans = deviceRows(repo, 'budget_plans').map((row) => ({ category: text(row, 'category'), amount: money(row, 'amount') }))
  const overrides = deviceRows(repo, 'budget_overrides').map((row) => ({
    category: text(row, 'category'),
    amount: money(row, 'amount'),
    month: text(row, 'month'),
  }))
  const monthly = monthlyBudget(period.month, plans, overrides)
  const budget = ringBudget(monthly, period, localPeriodBudget)
  const ring = ringProgress(spent, budget)

  const dates = new Set<string>()
  for (const row of [...periodExpenses, ...periodIncome]) dates.add(row.date)

  const totals = new Map<string, number>()
  for (const row of periodExpenses) totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount)
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = ranked[0]

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
  const maxGoals = signedIn ? repo.knownPlan()?.maxGoals ?? FREE_PLAN_MAX_GOALS : FREE_PLAN_MAX_GOALS
  const grace = repo.goalCreatesBlocked()
  const capMessage = !grace && goalRows.length >= maxGoals ? LOCAL_GOAL_CAP_MESSAGE : null

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
    daysLogged: dates.size,
    topCategory: top ? { name: top[0], amount: roundMoney(top[1]), icon: iconForCategory(top[0], 'expense') } : null,
    goalPercent: featured ? featured.percent : null,
    goalName: featured ? featured.name : null,
    recent: visible.slice(0, 5),
    history: visible,
    goals,
    grace,
    capMessage,
  }
}
