import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { assertBudgetEditingAllowed, budgetEditingAllowed as budgetAccessAllowsEditing, type BudgetAccess } from '../domain/budgetLock'
import { DomainError } from '../domain/errors'
import { goalProgressAmount } from '../domain/goalTotal'
import { createId } from '../domain/ids'
import { assertNonNegativeMoney, assertPositiveMoney, moneyToText } from '../domain/money'
import { FREE_PLAN_MAX_GOALS, GOAL_CREATION_GRACE, GOAL_GRACE_BLOCK_MESSAGE, GOAL_LIMIT_REACHED, type ResolvedPlanCap } from '../domain/planLimits'
import { canonicalTimestamp, optionalNote, optionalText, requireIsoDate, requireText } from '../domain/time'
import { assertNever } from '../sync/assertNever'
import type { ApplyServerResult, LocalStore } from '../sync/localStore'
import { decidePull } from '../sync/merge'
import type { ServerRow, ServerStamp, SyncRow, SyncedTable, TableCounts } from '../sync/model'
import { emptyCounts, SYNCED_TABLES } from '../sync/model'
import {
  budgetOverrides,
  budgetPlans,
  expenses,
  financialAccounts,
  goals,
  incomeAllocations,
  incomeRecords,
  localMeta,
  schema,
  syncCursors,
} from './schema'

type RunResult = { changes: number }
export type KlaroDb = BaseSQLiteDatabase<'sync', RunResult, typeof schema>

const SESSION_USER_KEY = 'session_user_id'
const BUDGET_ACCESS_KEY = 'budget_access'
const GOAL_CREATES_BLOCKED_KEY = 'goal_creates_blocked'
const KNOWN_PLAN_KEY = 'known_plan'
const nextRevision = sql`revision + 1`

type ExpenseType = 'needs' | 'wants'
type AccountType = 'asset' | 'liability'

export type RepositoryOptions = {
  db: KlaroDb
  now?: () => Date
  createId?: () => string
}

function expenseType(value: string): ExpenseType {
  if (value === 'needs' || value === 'wants') return value
  throw new DomainError('INVALID_TYPE', 'Expense type must be needs or wants.')
}

function accountType(value: string): AccountType {
  if (value === 'asset' || value === 'liability') return value
  throw new DomainError('INVALID_TYPE', 'Account type must be asset or liability.')
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed')
}

function mapBase(row: {
  id: string
  userId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: boolean
  baseUpdatedAt: string | null
  revision: number
}, table: SyncedTable, values: Record<string, string | null>): SyncRow {
  return {
    table,
    id: row.id,
    user_id: row.userId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    deleted_at: row.deletedAt,
    dirty: row.dirty,
    base_updated_at: row.baseUpdatedAt,
    revision: row.revision,
    values,
  }
}

function mapExpense(row: typeof expenses.$inferSelect): SyncRow {
  return mapBase(row, 'expenses', {
    category: row.category,
    type: row.type,
    amount: row.amount,
    date: row.date,
    description: row.description,
  })
}

function mapIncome(row: typeof incomeRecords.$inferSelect): SyncRow {
  return mapBase(row, 'income_records', {
    total_amount: row.totalAmount,
    disposable_amount: row.disposableAmount,
    date: row.date,
    income_source: row.incomeSource,
  })
}

function mapGoal(row: typeof goals.$inferSelect): SyncRow {
  return mapBase(row, 'goals', {
    name: row.name,
    target_amount: row.targetAmount,
    saved_amount: row.savedAmount,
    pinned_at: row.pinnedAt,
  })
}

function mapPlan(row: typeof budgetPlans.$inferSelect): SyncRow {
  return mapBase(row, 'budget_plans', {
    category: row.category,
    amount: row.amount,
    note: row.note,
  })
}

function mapOverride(row: typeof budgetOverrides.$inferSelect): SyncRow {
  return mapBase(row, 'budget_overrides', {
    category: row.category,
    amount: row.amount,
    month: row.month,
    note: row.note,
  })
}

function mapAccount(row: typeof financialAccounts.$inferSelect): SyncRow {
  return mapBase(row, 'financial_accounts', {
    type: row.type,
    subtype: row.subtype,
    institution_name: row.institutionName,
    custom_name: row.customName,
    amount: row.amount,
    notes: row.notes,
  })
}

function mapAllocation(row: typeof incomeAllocations.$inferSelect): SyncRow {
  return mapBase(row, 'income_allocations', {
    income_record_id: row.incomeRecordId,
    goal_id: row.goalId,
    amount: row.amount,
  })
}

function parseKnownPlan(raw: string): ResolvedPlanCap | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (typeof record.name !== 'string') return null
    if (typeof record.maxGoals !== 'number' || !Number.isInteger(record.maxGoals) || record.maxGoals < 0) return null
    return {
      name: record.name,
      maxGoals: record.maxGoals,
      blocksNewGoals: record.blocksNewGoals === true ? true : undefined,
    }
  } catch {
    return null
  }
}

function parseBudgetAccess(raw: string): BudgetAccess | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (typeof record.fullBudgeting !== 'boolean' || typeof record.simulateExpired !== 'boolean') return null
    if (record.accountCreatedAt != null && typeof record.accountCreatedAt !== 'string') return null
    return {
      fullBudgeting: record.fullBudgeting,
      accountCreatedAt: typeof record.accountCreatedAt === 'string' ? record.accountCreatedAt : null,
      simulateExpired: record.simulateExpired,
    }
  } catch {
    return null
  }
}

function requiredValue(row: ServerRow, key: string): string {
  const value = row.values[key]
  if (value == null) throw new DomainError('REMOTE_ROW', `Missing ${key}.`)
  return value
}

export class KlaroRepository implements LocalStore {
  private readonly db: KlaroDb
  private readonly clock: () => Date
  private readonly ids: () => string

  constructor(options: RepositoryOptions) {
    this.db = options.db
    this.clock = options.now ?? (() => new Date())
    this.ids = options.createId ?? createId
  }

  private now(): string {
    return this.clock().toISOString()
  }

  private nextId(): string {
    return this.ids()
  }

  private withTx(fn: (tx: KlaroDb) => void): void {
    this.db.transaction((tx) => {
      fn(tx as unknown as KlaroDb)
    })
  }

  private meta(key: string): string | null {
    return this.db.select().from(localMeta).where(eq(localMeta.key, key)).get()?.value ?? null
  }

  private setMeta(key: string, value: string | null): void {
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

  sessionUserId(): string | null {
    return this.meta(SESSION_USER_KEY)
  }

  setSessionUserId(userId: string | null): void {
    this.setMeta(SESSION_USER_KEY, userId)
  }

  setBudgetAccess(access: BudgetAccess | null): void {
    this.setMeta(BUDGET_ACCESS_KEY, access == null ? null : JSON.stringify(access))
  }

  budgetEditingAllowed(): boolean {
    const access = this.readBudgetAccess()
    if (!access) return true
    return budgetAccessAllowsEditing(access, this.clock())
  }

  private readBudgetAccess(): BudgetAccess | null {
    const raw = this.meta(BUDGET_ACCESS_KEY)
    if (!raw) return null
    return parseBudgetAccess(raw)
  }

  setGoalCreatesBlocked(blocked: boolean): void {
    this.setMeta(GOAL_CREATES_BLOCKED_KEY, blocked ? 'grace' : null)
  }

  goalCreatesBlocked(): boolean {
    return this.meta(GOAL_CREATES_BLOCKED_KEY) === 'grace'
  }

  setKnownPlan(plan: ResolvedPlanCap): void {
    this.setMeta(KNOWN_PLAN_KEY, JSON.stringify({
      name: plan.name,
      maxGoals: plan.maxGoals,
      blocksNewGoals: plan.blocksNewGoals === true,
    }))
  }

  knownPlan(): ResolvedPlanCap | null {
    const raw = this.meta(KNOWN_PLAN_KEY)
    if (!raw) return null
    return parseKnownPlan(raw)
  }

  holdUnsyncedGoalCreates(userId: string): number {
    const pending = this.db.select({ id: goals.id }).from(goals).where(and(
      eq(goals.userId, userId),
      isNull(goals.deletedAt),
      isNull(goals.baseUpdatedAt),
      eq(goals.dirty, true),
    )).all()
    if (pending.length === 0) return 0
    this.db.update(goals).set({ dirty: false }).where(and(
      eq(goals.userId, userId),
      isNull(goals.deletedAt),
      isNull(goals.baseUpdatedAt),
      eq(goals.dirty, true),
    )).run()
    return pending.length
  }

  releaseHeldGoalCreates(userId: string): void {
    this.db.update(goals).set({ dirty: true }).where(and(
      eq(goals.userId, userId),
      isNull(goals.deletedAt),
      isNull(goals.baseUpdatedAt),
      eq(goals.dirty, false),
    )).run()
  }

  holdAllocationsForUnsyncedGoals(userId: string): void {
    const unsynced = this.unsyncedLiveGoalIds(userId)
    if (unsynced.length === 0) return
    this.db.update(incomeAllocations).set({ dirty: false }).where(and(
      eq(incomeAllocations.userId, userId),
      isNull(incomeAllocations.deletedAt),
      inArray(incomeAllocations.goalId, unsynced),
    )).run()
  }

  releaseAllocationsForGoal(goalId: string): void {
    this.db.update(incomeAllocations).set({ dirty: true }).where(and(
      eq(incomeAllocations.goalId, goalId),
      isNull(incomeAllocations.deletedAt),
      isNull(incomeAllocations.baseUpdatedAt),
    )).run()
  }

  private unsyncedLiveGoalIds(userId: string): string[] {
    return this.db.select({ id: goals.id }).from(goals).where(and(
      isNull(goals.deletedAt),
      isNull(goals.baseUpdatedAt),
      or(eq(goals.userId, userId), isNull(goals.userId)),
    )).all().map((row) => row.id)
  }

  /** Signed-in writes use the stored clock. No clock yet, and local-only rows, stay editable. */
  private assertBudgetWritable(userId: string | null): void {
    if (userId == null) return
    const access = this.readBudgetAccess()
    if (!access) return
    assertBudgetEditingAllowed(access, this.clock())
  }

  getCursor(userId: string, table: SyncedTable): string | null {
    return (
      this.db
        .select()
        .from(syncCursors)
        .where(and(eq(syncCursors.userId, userId), eq(syncCursors.tableName, table)))
        .get()?.cursorUpdatedAt ?? null
    )
  }

  setCursor(userId: string, table: SyncedTable, cursor: string): void {
    this.db
      .insert(syncCursors)
      .values({ userId, tableName: table, cursorUpdatedAt: cursor })
      .onConflictDoUpdate({
        target: [syncCursors.userId, syncCursors.tableName],
        set: { cursorUpdatedAt: cursor },
      })
      .run()
  }

  clearAll(): void {
    this.withTx((tx) => {
      tx.delete(incomeAllocations).run()
      tx.delete(expenses).run()
      tx.delete(incomeRecords).run()
      tx.delete(goals).run()
      tx.delete(budgetPlans).run()
      tx.delete(budgetOverrides).run()
      tx.delete(financialAccounts).run()
      tx.delete(syncCursors).run()
      tx.delete(localMeta).run()
    })
  }

  adoptUnassigned(userId: string): void {
    const patch = { userId, dirty: true, revision: nextRevision }
    this.withTx((tx) => {
      tx.update(expenses).set(patch).where(isNull(expenses.userId)).run()
      tx.update(incomeRecords).set(patch).where(isNull(incomeRecords.userId)).run()
      tx.update(goals).set(patch).where(isNull(goals.userId)).run()
      tx.update(budgetPlans).set(patch).where(isNull(budgetPlans.userId)).run()
      tx.update(budgetOverrides).set(patch).where(isNull(budgetOverrides.userId)).run()
      tx.update(financialAccounts).set(patch).where(isNull(financialAccounts.userId)).run()
      tx.update(incomeAllocations).set(patch).where(isNull(incomeAllocations.userId)).run()
    })
  }

  countLive(userId: string): TableCounts {
    const counts = emptyCounts()
    for (const table of SYNCED_TABLES) {
      counts[table] = this.countVisible(table, userId)
    }
    return counts
  }

  countUnsyncedLiveGoals(userId: string): number {
    const row = this.db.get<{ n: number }>(sql`
      select count(*) as n from goals
      where deleted_at is null
        and base_updated_at is null
        and (user_id = ${userId} or user_id is null)
    `)
    return Number(row?.n ?? 0)
  }

  countPendingGoalDeletes(userId: string): number {
    const row = this.db.get<{ n: number }>(sql`
      select count(*) as n from goals
      where deleted_at is not null
        and dirty = 1
        and base_updated_at is not null
        and (user_id = ${userId} or user_id is null)
    `)
    return Number(row?.n ?? 0)
  }

  private countVisible(table: SyncedTable, userId: string): number {
    const row = this.db.get<{ n: number }>(sql`
      select count(*) as n
      from ${sql.identifier(table)}
      where deleted_at is null
        and (user_id = ${userId} or user_id is null)
    `)
    return Number(row?.n ?? 0)
  }

  listLive(table: SyncedTable, userId: string | null): SyncRow[] {
    return this.rowsForOwner(table, userId).filter((row) => row.deleted_at == null)
  }

  listDirty(table: SyncedTable, userId: string): SyncRow[] {
    return this.rowsForOwner(table, userId).filter((row) => row.dirty)
  }

  getRow(table: SyncedTable, id: string): SyncRow | null {
    switch (table) {
      case 'expenses':
        return this.mapOne(this.db.select().from(expenses).where(eq(expenses.id, id)).get(), mapExpense)
      case 'income_records':
        return this.mapOne(this.db.select().from(incomeRecords).where(eq(incomeRecords.id, id)).get(), mapIncome)
      case 'goals':
        return this.mapOne(this.db.select().from(goals).where(eq(goals.id, id)).get(), mapGoal)
      case 'budget_plans':
        return this.mapOne(this.db.select().from(budgetPlans).where(eq(budgetPlans.id, id)).get(), mapPlan)
      case 'budget_overrides':
        return this.mapOne(this.db.select().from(budgetOverrides).where(eq(budgetOverrides.id, id)).get(), mapOverride)
      case 'financial_accounts':
        return this.mapOne(this.db.select().from(financialAccounts).where(eq(financialAccounts.id, id)).get(), mapAccount)
      case 'income_allocations':
        return this.mapOne(this.db.select().from(incomeAllocations).where(eq(incomeAllocations.id, id)).get(), mapAllocation)
      default:
        return assertNever(table, 'table')
    }
  }

  private mapOne<T>(row: T | undefined, map: (row: T) => SyncRow): SyncRow | null {
    return row ? map(row) : null
  }

  private rowsForOwner(table: SyncedTable, userId: string | null): SyncRow[] {
    const owner = userId == null
    switch (table) {
      case 'expenses':
        return this.db.select().from(expenses).where(owner ? isNull(expenses.userId) : eq(expenses.userId, userId)).all().map(mapExpense)
      case 'income_records':
        return this.db.select().from(incomeRecords).where(owner ? isNull(incomeRecords.userId) : eq(incomeRecords.userId, userId)).all().map(mapIncome)
      case 'goals':
        return this.db.select().from(goals).where(owner ? isNull(goals.userId) : eq(goals.userId, userId)).all().map(mapGoal)
      case 'budget_plans':
        return this.db.select().from(budgetPlans).where(owner ? isNull(budgetPlans.userId) : eq(budgetPlans.userId, userId)).all().map(mapPlan)
      case 'budget_overrides':
        return this.db.select().from(budgetOverrides).where(owner ? isNull(budgetOverrides.userId) : eq(budgetOverrides.userId, userId)).all().map(mapOverride)
      case 'financial_accounts':
        return this.db.select().from(financialAccounts).where(owner ? isNull(financialAccounts.userId) : eq(financialAccounts.userId, userId)).all().map(mapAccount)
      case 'income_allocations':
        return this.db.select().from(incomeAllocations).where(owner ? isNull(incomeAllocations.userId) : eq(incomeAllocations.userId, userId)).all().map(mapAllocation)
      default:
        return assertNever(table, 'table')
    }
  }

  private requireRow(table: SyncedTable, id: string): SyncRow {
    const row = this.getRow(table, id)
    if (!row || row.deleted_at) throw new DomainError('NOT_FOUND', 'Record not found.')
    return row
  }

  createExpense(input: {
    userId: string | null
    category: string
    type: string
    amount: number
    date: string
    description?: string | null
  }): SyncRow {
    const now = this.now()
    const id = this.nextId()
    this.db.insert(expenses).values({
      id,
      userId: input.userId,
      category: requireText(input.category, 'category'),
      type: expenseType(input.type),
      amount: moneyToText(assertPositiveMoney(input.amount)),
      date: requireIsoDate(input.date),
      description: optionalText(input.description),
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('expenses', id)
  }

  updateExpense(id: string, input: { category?: string; type?: string; amount?: number; date?: string; description?: string | null }): SyncRow {
    const current = this.requireRow('expenses', id)
    this.db.update(expenses).set({
      category: input.category != null ? requireText(input.category, 'category') : requiredValueText(current, 'category'),
      type: input.type != null ? expenseType(input.type) : expenseType(requiredValueText(current, 'type')),
      amount: input.amount != null ? moneyToText(assertPositiveMoney(input.amount)) : requiredValueText(current, 'amount'),
      date: input.date != null ? requireIsoDate(input.date) : requiredValueText(current, 'date'),
      description: input.description === undefined ? current.values.description : optionalText(input.description),
      updatedAt: this.now(),
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(expenses.id, id), isNull(expenses.deletedAt))).run()
    return this.requireRow('expenses', id)
  }

  softDeleteExpense(id: string): void {
    this.tombstone('Expense not found.', (now) => this.db.update(expenses).set({
      deletedAt: now,
      updatedAt: now,
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(expenses.id, id), isNull(expenses.deletedAt))).run())
  }

  createIncome(input: {
    userId: string | null
    totalAmount: number
    date: string
    incomeSource?: string | null
  }): SyncRow {
    const total = moneyToText(assertPositiveMoney(input.totalAmount, 'total'))
    const now = this.now()
    const id = this.nextId()
    this.db.insert(incomeRecords).values({
      id,
      userId: input.userId,
      totalAmount: total,
      disposableAmount: total,
      date: requireIsoDate(input.date),
      incomeSource: optionalText(input.incomeSource),
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('income_records', id)
  }

  updateIncome(id: string, input: { totalAmount?: number; date?: string; incomeSource?: string | null }): SyncRow {
    const current = this.requireRow('income_records', id)
    const total = input.totalAmount != null
      ? assertPositiveMoney(input.totalAmount, 'total')
      : assertPositiveMoney(Number(requiredValueText(current, 'total_amount')), 'total')
    const allocated = this.allocatedToIncome(id)
    if (total + 1e-9 < allocated) {
      throw new DomainError('INVALID_AMOUNT', 'Total cannot be less than the amount already allocated.')
    }
    this.db.update(incomeRecords).set({
      totalAmount: moneyToText(total),
      disposableAmount: moneyToText(Math.max(0, total - allocated)),
      date: input.date != null ? requireIsoDate(input.date) : requiredValueText(current, 'date'),
      incomeSource: input.incomeSource === undefined ? current.values.income_source : optionalText(input.incomeSource),
      updatedAt: this.now(),
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(incomeRecords.id, id), isNull(incomeRecords.deletedAt))).run()
    return this.requireRow('income_records', id)
  }

  softDeleteIncome(id: string): void {
    const current = this.getRow('income_records', id)
    if (!current || current.deleted_at) throw new DomainError('NOT_FOUND', 'Income record not found.')
    const now = this.now()
    this.withTx((tx) => {
      tx.update(incomeRecords).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(eq(incomeRecords.id, id)).run()
      tx.update(incomeAllocations).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(and(
        eq(incomeAllocations.incomeRecordId, id),
        isNull(incomeAllocations.deletedAt),
      )).run()
    })
  }

  createGoal(input: {
    userId: string | null
    name: string
    targetAmount: number
    pinnedAt?: string | null
    maxGoals?: number
  }): SyncRow {
    if (input.userId != null && this.goalCreatesBlocked()) {
      throw new DomainError(GOAL_CREATION_GRACE, GOAL_GRACE_BLOCK_MESSAGE)
    }
    const maxGoals = input.userId == null ? FREE_PLAN_MAX_GOALS : input.maxGoals ?? FREE_PLAN_MAX_GOALS
    if (this.countGoalsTowardLimit(input.userId) >= maxGoals) {
      throw new DomainError(GOAL_LIMIT_REACHED, 'Goal count is already at the plan max_goals.')
    }
    const now = this.now()
    const id = this.nextId()
    this.db.insert(goals).values({
      id,
      userId: input.userId,
      name: requireText(input.name, 'name'),
      targetAmount: moneyToText(assertPositiveMoney(input.targetAmount, 'target')),
      pinnedAt: input.pinnedAt ? canonicalTimestamp(input.pinnedAt) : null,
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('goals', id)
  }

  updateGoal(id: string, input: { name?: string; targetAmount?: number; pinnedAt?: string | null }): SyncRow {
    const current = this.requireRow('goals', id)
    this.db.update(goals).set({
      name: input.name != null ? requireText(input.name, 'name') : requiredValueText(current, 'name'),
      targetAmount: input.targetAmount != null
        ? moneyToText(assertPositiveMoney(input.targetAmount, 'target'))
        : requiredValueText(current, 'target_amount'),
      pinnedAt: input.pinnedAt === undefined ? current.values.pinned_at : input.pinnedAt ? canonicalTimestamp(input.pinnedAt) : null,
      updatedAt: this.now(),
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(goals.id, id), isNull(goals.deletedAt))).run()
    return this.requireRow('goals', id)
  }

  softDeleteGoal(id: string): void {
    const current = this.getRow('goals', id)
    if (!current || current.deleted_at) throw new DomainError('NOT_FOUND', 'Goal not found.')
    const now = this.now()
    this.withTx((tx) => {
      tx.update(goals).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(eq(goals.id, id)).run()
      tx.update(incomeAllocations).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(and(
        eq(incomeAllocations.goalId, id),
        isNull(incomeAllocations.deletedAt),
      )).run()
    })
  }

  goalProgress(goalId: string): number {
    const goal = this.getRow('goals', goalId)
    if (!goal) throw new DomainError('NOT_FOUND', 'Goal not found.')
    const allocations = this.db
      .select({ amount: incomeAllocations.amount, deletedAt: incomeAllocations.deletedAt })
      .from(incomeAllocations)
      .where(eq(incomeAllocations.goalId, goalId))
      .all()
    return goalProgressAmount(
      goal.values.saved_amount ?? '0',
      allocations.map((row) => ({ amount: row.amount, deleted_at: row.deletedAt })),
    )
  }

  /**
   * A deposit is an allocation row. `incomeRecordId` is optional.
   * Deleting a goal or income tombstones its allocations, matching the server trigger.
   */
  createDeposit(input: {
    userId: string | null
    goalId: string
    amount: number
    incomeRecordId?: string | null
  }): SyncRow {
    const amount = assertPositiveMoney(input.amount)
    const goal = this.requireRow('goals', input.goalId)
    if (goal.user_id !== input.userId) throw new DomainError('NOT_FOUND', 'Goal not found.')
    const incomeId = input.incomeRecordId ?? null
    if (incomeId) {
      const income = this.requireRow('income_records', incomeId)
      if (income.user_id !== input.userId) throw new DomainError('NOT_FOUND', 'Income record not found.')
      const allocated = this.allocatedToIncome(incomeId)
      const total = Number(requiredValueText(income, 'total_amount'))
      if (allocated + amount > total + 1e-9) {
        throw new DomainError('INVALID_AMOUNT', 'Amount cannot exceed remaining funds on this income.')
      }
    }
    const now = this.now()
    const id = this.nextId()
    this.withTx((tx) => {
      tx.insert(incomeAllocations).values({
        id,
        userId: input.userId,
        goalId: input.goalId,
        incomeRecordId: incomeId,
        amount: moneyToText(amount),
        createdAt: now,
        updatedAt: now,
        dirty: true,
        revision: 1,
      }).run()
      if (incomeId) this.syncDisposable(tx, incomeId)
    })
    return this.requireRow('income_allocations', id)
  }

  updateDeposit(id: string, amountInput: number): SyncRow {
    const current = this.requireRow('income_allocations', id)
    const amount = assertPositiveMoney(amountInput)
    const incomeId = current.values.income_record_id
    if (incomeId) {
      const income = this.requireRow('income_records', incomeId)
      const allocated = this.allocatedToIncome(incomeId, id)
      const total = Number(requiredValueText(income, 'total_amount'))
      if (allocated + amount > total + 1e-9) {
        throw new DomainError('INVALID_AMOUNT', 'Amount cannot exceed remaining funds on this income.')
      }
    }
    this.withTx((tx) => {
      tx.update(incomeAllocations).set({
        amount: moneyToText(amount),
        updatedAt: this.now(),
        dirty: true,
        revision: nextRevision,
      }).where(and(eq(incomeAllocations.id, id), isNull(incomeAllocations.deletedAt))).run()
      if (incomeId) this.syncDisposable(tx, incomeId)
    })
    return this.requireRow('income_allocations', id)
  }

  softDeleteDeposit(id: string): void {
    const current = this.requireRow('income_allocations', id)
    const incomeId = current.values.income_record_id
    const now = this.now()
    this.withTx((tx) => {
      tx.update(incomeAllocations).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(eq(incomeAllocations.id, id)).run()
      if (incomeId) this.syncDisposable(tx, incomeId)
    })
  }

  createBudgetPlan(input: { userId: string | null; category: string; amount: number; note?: string | null }): SyncRow {
    this.assertBudgetWritable(input.userId)
    const category = requireText(input.category, 'category')
    if (this.findLivePlan(input.userId, category)) {
      throw new DomainError('UNIQUE_CONFLICT', 'A live budget plan already exists for this category.')
    }
    const now = this.now()
    const id = this.nextId()
    this.db.insert(budgetPlans).values({
      id,
      userId: input.userId,
      category,
      amount: moneyToText(assertPositiveMoney(input.amount)),
      note: optionalNote(input.note),
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('budget_plans', id)
  }

  replaceBudgetPlans(userId: string | null, items: ReadonlyArray<{ category: string; amount: number; note?: string | null }>): void {
    this.assertBudgetWritable(userId)
    if (items.length === 0) {
      throw new DomainError('INVALID', 'Send at least one category with an amount greater than 0.')
    }
    const now = this.now()
    this.withTx((tx) => {
      tx.update(budgetPlans).set({ deletedAt: now, updatedAt: now, dirty: true, revision: nextRevision }).where(and(
        isNull(budgetPlans.deletedAt),
        userId == null ? isNull(budgetPlans.userId) : eq(budgetPlans.userId, userId),
      )).run()
      for (const item of items) {
        tx.insert(budgetPlans).values({
          id: this.nextId(),
          userId,
          category: requireText(item.category, 'category'),
          amount: moneyToText(assertPositiveMoney(item.amount)),
          note: optionalNote(item.note),
          createdAt: now,
          updatedAt: now,
          dirty: true,
          revision: 1,
        }).run()
      }
    })
  }

  saveBudgetOverride(input: {
    userId: string | null
    category: string
    amount: number
    month: string
    note?: string | null
  }): SyncRow {
    this.assertBudgetWritable(input.userId)
    const category = requireText(input.category, 'category')
    const month = `${requireIsoDate(input.month, 'month').slice(0, 7)}-01`
    const amount = moneyToText(assertNonNegativeMoney(input.amount))
    const note = optionalNote(input.note)
    const existing = this.findLiveOverride(input.userId, category, month)
    const now = this.now()
    if (existing) {
      this.db.update(budgetOverrides).set({
        amount,
        note,
        updatedAt: now,
        dirty: true,
        revision: nextRevision,
      }).where(eq(budgetOverrides.id, existing.id)).run()
      return this.requireRow('budget_overrides', existing.id)
    }
    const id = this.nextId()
    this.db.insert(budgetOverrides).values({
      id,
      userId: input.userId,
      category,
      amount,
      month,
      note,
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('budget_overrides', id)
  }

  createAccount(input: {
    userId: string | null
    type: string
    subtype: string
    amount: number
    institutionName?: string | null
    customName?: string | null
    notes?: string | null
  }): SyncRow {
    const now = this.now()
    const id = this.nextId()
    this.db.insert(financialAccounts).values({
      id,
      userId: input.userId,
      type: accountType(input.type),
      subtype: requireText(input.subtype, 'subtype'),
      amount: moneyToText(assertNonNegativeMoney(input.amount)),
      institutionName: optionalText(input.institutionName),
      customName: optionalText(input.customName),
      notes: optionalText(input.notes),
      createdAt: now,
      updatedAt: now,
      dirty: true,
      revision: 1,
    }).run()
    return this.requireRow('financial_accounts', id)
  }

  updateAccount(id: string, input: {
    subtype?: string
    amount?: number
    institutionName?: string | null
    customName?: string | null
    notes?: string | null
  }): SyncRow {
    const current = this.requireRow('financial_accounts', id)
    this.db.update(financialAccounts).set({
      subtype: input.subtype != null ? requireText(input.subtype, 'subtype') : requiredValueText(current, 'subtype'),
      amount: input.amount != null ? moneyToText(assertNonNegativeMoney(input.amount)) : requiredValueText(current, 'amount'),
      institutionName: input.institutionName === undefined ? current.values.institution_name : optionalText(input.institutionName),
      customName: input.customName === undefined ? current.values.custom_name : optionalText(input.customName),
      notes: input.notes === undefined ? current.values.notes : optionalText(input.notes),
      updatedAt: this.now(),
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(financialAccounts.id, id), isNull(financialAccounts.deletedAt))).run()
    return this.requireRow('financial_accounts', id)
  }

  softDeleteAccount(id: string): void {
    this.tombstone('Account not found.', (now) => this.db.update(financialAccounts).set({
      deletedAt: now,
      updatedAt: now,
      dirty: true,
      revision: nextRevision,
    }).where(and(eq(financialAccounts.id, id), isNull(financialAccounts.deletedAt))).run())
  }

  applyServerRow(table: SyncedTable, row: ServerRow): ApplyServerResult {
    const local = this.getRow(table, row.id)
    const decision = decidePull(
      local && {
        dirty: local.dirty,
        deleted_at: local.deleted_at,
        base_updated_at: local.base_updated_at,
      },
      row,
    )
    if (decision === 'keep-local') return { budgetsKeptFromAccount: 0 }
    const deletedAt = row.deleted_at ?? local?.deleted_at ?? null
    let budgetsKeptFromAccount = 0
    try {
      this.db.transaction((tx) => {
        const database = tx as unknown as KlaroDb
        budgetsKeptFromAccount = this.retireClashingBudget(database, table, row)
        this.upsertServer(table, row, deletedAt, database)
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('UNIQUE_CONFLICT', `Unique constraint on ${table}.`)
      }
      throw error
    }
    return { budgetsKeptFromAccount }
  }

  markSynced(table: SyncedTable, id: string, stamp: ServerStamp, revision: number): void {
    const local = this.getRow(table, id)
    if (!local) return
    const releaseDeposits = table === 'goals' && local.base_updated_at == null && local.deleted_at == null
    const updatedAt = canonicalTimestamp(stamp.updated_at)
    if (local.revision !== revision) {
      this.patchMeta(table, id, {
        updatedAt: local.updated_at,
        deletedAt: local.deleted_at,
        baseUpdatedAt: updatedAt,
        dirty: true,
      })
    } else {
      const serverDeleted = stamp.deleted_at ? canonicalTimestamp(stamp.deleted_at) : null
      const deletedAt = serverDeleted ?? local.deleted_at
      const dirty = local.deleted_at != null && serverDeleted == null
      this.patchMeta(table, id, { updatedAt, deletedAt, baseUpdatedAt: updatedAt, dirty })
    }
    if (releaseDeposits) this.releaseAllocationsForGoal(id)
  }

  discardNeverSynced(table: SyncedTable, id: string): void {
    const local = this.getRow(table, id)
    if (!local || local.base_updated_at != null || local.deleted_at == null) return
    if (table === 'goals') this.deleteUnsyncedAllocationTombstones(incomeAllocations.goalId, id)
    if (table === 'income_records') this.deleteUnsyncedAllocationTombstones(incomeAllocations.incomeRecordId, id)
    this.hardDelete(table, id)
  }

  private deleteUnsyncedAllocationTombstones(
    column: typeof incomeAllocations.goalId | typeof incomeAllocations.incomeRecordId,
    id: string,
  ): void {
    const children = this.db.select().from(incomeAllocations).where(eq(column, id)).all()
    for (const child of children) {
      if (child.baseUpdatedAt == null && child.deletedAt) {
        this.db.delete(incomeAllocations).where(eq(incomeAllocations.id, child.id)).run()
      }
    }
  }

  private countGoalsTowardLimit(userId: string | null): number {
    const row = userId == null
      ? this.db.get<{ n: number }>(sql`
          select count(*) as n from goals
          where deleted_at is null and user_id is null
        `)
      : this.db.get<{ n: number }>(sql`
          select count(*) as n from goals
          where deleted_at is null and (user_id = ${userId} or user_id is null)
        `)
    return Number(row?.n ?? 0)
  }

  private allocatedToIncome(incomeId: string, exceptId?: string): number {
    const rows = this.db
      .select({ id: incomeAllocations.id, amount: incomeAllocations.amount })
      .from(incomeAllocations)
      .where(and(eq(incomeAllocations.incomeRecordId, incomeId), isNull(incomeAllocations.deletedAt)))
      .all()
    return rows
      .filter((row) => row.id !== exceptId)
      .reduce((sum, row) => sum + Number(row.amount), 0)
  }

  private syncDisposable(tx: KlaroDb, incomeId: string): void {
    const income = tx.select().from(incomeRecords).where(eq(incomeRecords.id, incomeId)).get()
    if (!income || income.deletedAt) return
    const rows = tx
      .select({ amount: incomeAllocations.amount })
      .from(incomeAllocations)
      .where(and(eq(incomeAllocations.incomeRecordId, incomeId), isNull(incomeAllocations.deletedAt)))
      .all()
    const allocated = rows.reduce((sum, row) => sum + Number(row.amount), 0)
    const disposable = Math.max(0, Number(income.totalAmount) - allocated)
    tx.update(incomeRecords).set({
      disposableAmount: moneyToText(disposable),
      updatedAt: this.now(),
      dirty: true,
      revision: nextRevision,
    }).where(eq(incomeRecords.id, incomeId)).run()
  }

  private findLivePlan(userId: string | null, category: string) {
    return this.db.select().from(budgetPlans).where(and(
      isNull(budgetPlans.deletedAt),
      eq(budgetPlans.category, category),
      userId == null ? isNull(budgetPlans.userId) : eq(budgetPlans.userId, userId),
    )).get()
  }

  private findLiveOverride(userId: string | null, category: string, month: string) {
    return this.db.select().from(budgetOverrides).where(and(
      isNull(budgetOverrides.deletedAt),
      eq(budgetOverrides.category, category),
      eq(budgetOverrides.month, month),
      userId == null ? isNull(budgetOverrides.userId) : eq(budgetOverrides.userId, userId),
    )).get()
  }

  private tombstone(message: string, update: (now: string) => RunResult): void {
    const result = update(this.now())
    if (result.changes === 0) throw new DomainError('NOT_FOUND', message)
  }

  private patchMeta(table: SyncedTable, id: string, patch: {
    updatedAt: string
    deletedAt: string | null
    baseUpdatedAt: string
    dirty: boolean
  }): void {
    switch (table) {
      case 'expenses':
        this.db.update(expenses).set(patch).where(eq(expenses.id, id)).run()
        return
      case 'income_records':
        this.db.update(incomeRecords).set(patch).where(eq(incomeRecords.id, id)).run()
        return
      case 'goals':
        this.db.update(goals).set(patch).where(eq(goals.id, id)).run()
        return
      case 'budget_plans':
        this.db.update(budgetPlans).set(patch).where(eq(budgetPlans.id, id)).run()
        return
      case 'budget_overrides':
        this.db.update(budgetOverrides).set(patch).where(eq(budgetOverrides.id, id)).run()
        return
      case 'financial_accounts':
        this.db.update(financialAccounts).set(patch).where(eq(financialAccounts.id, id)).run()
        return
      case 'income_allocations':
        this.db.update(incomeAllocations).set(patch).where(eq(incomeAllocations.id, id)).run()
        return
      default:
        assertNever(table, 'table')
    }
  }

  private hardDelete(table: SyncedTable, id: string): void {
    switch (table) {
      case 'expenses':
        this.db.delete(expenses).where(eq(expenses.id, id)).run()
        return
      case 'income_records':
        this.db.delete(incomeRecords).where(eq(incomeRecords.id, id)).run()
        return
      case 'goals':
        this.db.delete(goals).where(eq(goals.id, id)).run()
        return
      case 'budget_plans':
        this.db.delete(budgetPlans).where(eq(budgetPlans.id, id)).run()
        return
      case 'budget_overrides':
        this.db.delete(budgetOverrides).where(eq(budgetOverrides.id, id)).run()
        return
      case 'financial_accounts':
        this.db.delete(financialAccounts).where(eq(financialAccounts.id, id)).run()
        return
      case 'income_allocations':
        this.db.delete(incomeAllocations).where(eq(incomeAllocations.id, id)).run()
        return
      default:
        assertNever(table, 'table')
    }
  }

  /**
   * The account already has this live budget category (and month). Tombstone the
   * other local row so the server row can be stored. Count it only when that
   * local row was never acknowledged — a server replace of a synced row is not
   * a clash. Push-by-id still applies; the partial unique index is not a conflict target.
   */
  private retireClashingBudget(db: KlaroDb, table: SyncedTable, row: ServerRow): number {
    if (row.deleted_at) return 0
    switch (table) {
      case 'budget_plans':
        return this.retirePlan(db, row)
      case 'budget_overrides':
        return this.retireOverride(db, row)
      case 'expenses':
      case 'income_records':
      case 'goals':
      case 'financial_accounts':
      case 'income_allocations':
        return 0
      default:
        return assertNever(table, 'table')
    }
  }

  private retirePlan(db: KlaroDb, row: ServerRow): number {
    const category = requiredValue(row, 'category')
    const live = db.select().from(budgetPlans).where(and(
      isNull(budgetPlans.deletedAt),
      eq(budgetPlans.category, category),
      eq(budgetPlans.userId, row.user_id),
    )).get()
    if (!live || live.id === row.id) return 0
    const now = this.now()
    db.update(budgetPlans).set({
      deletedAt: now,
      updatedAt: now,
      dirty: true,
    }).where(eq(budgetPlans.id, live.id)).run()
    return live.baseUpdatedAt == null ? 1 : 0
  }

  private retireOverride(db: KlaroDb, row: ServerRow): number {
    const category = requiredValue(row, 'category')
    const month = requiredValue(row, 'month')
    const live = db.select().from(budgetOverrides).where(and(
      isNull(budgetOverrides.deletedAt),
      eq(budgetOverrides.category, category),
      eq(budgetOverrides.month, month),
      eq(budgetOverrides.userId, row.user_id),
    )).get()
    if (!live || live.id === row.id) return 0
    const now = this.now()
    db.update(budgetOverrides).set({
      deletedAt: now,
      updatedAt: now,
      dirty: true,
    }).where(eq(budgetOverrides.id, live.id)).run()
    return live.baseUpdatedAt == null ? 1 : 0
  }

  private upsertServer(table: SyncedTable, row: ServerRow, deletedAt: string | null, db: KlaroDb = this.db): void {
    const meta = {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt,
      dirty: false,
      baseUpdatedAt: row.updated_at,
    }
    switch (table) {
      case 'expenses':
        db.insert(expenses).values({
          ...meta,
          category: requiredValue(row, 'category'),
          type: requiredValue(row, 'type'),
          amount: requiredValue(row, 'amount'),
          date: requiredValue(row, 'date'),
          description: row.values.description,
        }).onConflictDoUpdate({
          target: expenses.id,
          set: {
            ...meta,
            category: requiredValue(row, 'category'),
            type: requiredValue(row, 'type'),
            amount: requiredValue(row, 'amount'),
            date: requiredValue(row, 'date'),
            description: row.values.description,
          },
        }).run()
        return
      case 'income_records':
        db.insert(incomeRecords).values({
          ...meta,
          totalAmount: requiredValue(row, 'total_amount'),
          disposableAmount: requiredValue(row, 'disposable_amount'),
          date: requiredValue(row, 'date'),
          incomeSource: row.values.income_source,
        }).onConflictDoUpdate({
          target: incomeRecords.id,
          set: {
            ...meta,
            totalAmount: requiredValue(row, 'total_amount'),
            disposableAmount: requiredValue(row, 'disposable_amount'),
            date: requiredValue(row, 'date'),
            incomeSource: row.values.income_source,
          },
        }).run()
        return
      case 'goals':
        db.insert(goals).values({
          ...meta,
          name: requiredValue(row, 'name'),
          targetAmount: requiredValue(row, 'target_amount'),
          savedAmount: requiredValue(row, 'saved_amount'),
          pinnedAt: row.values.pinned_at,
        }).onConflictDoUpdate({
          target: goals.id,
          set: {
            ...meta,
            name: requiredValue(row, 'name'),
            targetAmount: requiredValue(row, 'target_amount'),
            savedAmount: requiredValue(row, 'saved_amount'),
            pinnedAt: row.values.pinned_at,
          },
        }).run()
        return
      case 'budget_plans':
        db.insert(budgetPlans).values({
          ...meta,
          category: requiredValue(row, 'category'),
          amount: requiredValue(row, 'amount'),
          note: row.values.note,
        }).onConflictDoUpdate({
          target: budgetPlans.id,
          set: {
            ...meta,
            category: requiredValue(row, 'category'),
            amount: requiredValue(row, 'amount'),
            note: row.values.note,
          },
        }).run()
        return
      case 'budget_overrides':
        db.insert(budgetOverrides).values({
          ...meta,
          category: requiredValue(row, 'category'),
          amount: requiredValue(row, 'amount'),
          month: requiredValue(row, 'month'),
          note: row.values.note,
        }).onConflictDoUpdate({
          target: budgetOverrides.id,
          set: {
            ...meta,
            category: requiredValue(row, 'category'),
            amount: requiredValue(row, 'amount'),
            month: requiredValue(row, 'month'),
            note: row.values.note,
          },
        }).run()
        return
      case 'financial_accounts':
        db.insert(financialAccounts).values({
          ...meta,
          type: requiredValue(row, 'type'),
          subtype: requiredValue(row, 'subtype'),
          institutionName: row.values.institution_name,
          customName: row.values.custom_name,
          amount: requiredValue(row, 'amount'),
          notes: row.values.notes,
        }).onConflictDoUpdate({
          target: financialAccounts.id,
          set: {
            ...meta,
            type: requiredValue(row, 'type'),
            subtype: requiredValue(row, 'subtype'),
            institutionName: row.values.institution_name,
            customName: row.values.custom_name,
            amount: requiredValue(row, 'amount'),
            notes: row.values.notes,
          },
        }).run()
        return
      case 'income_allocations':
        db.insert(incomeAllocations).values({
          ...meta,
          incomeRecordId: row.values.income_record_id,
          goalId: requiredValue(row, 'goal_id'),
          amount: requiredValue(row, 'amount'),
        }).onConflictDoUpdate({
          target: incomeAllocations.id,
          set: {
            ...meta,
            incomeRecordId: row.values.income_record_id,
            goalId: requiredValue(row, 'goal_id'),
            amount: requiredValue(row, 'amount'),
          },
        }).run()
        return
      default:
        assertNever(table, 'table')
    }
  }
}

function requiredValueText(row: SyncRow, key: string): string {
  const value = row.values[key]
  if (value == null) throw new DomainError('SYNC', `Missing ${key}.`)
  return value
}
