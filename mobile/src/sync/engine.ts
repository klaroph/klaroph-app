import { BUDGET_LOCKED, BUDGET_LOCK_UPGRADE_MESSAGE } from '../domain/budgetLock'
import { DomainError } from '../domain/errors'
import {
  FREE_PLAN_CAP,
  GOAL_CREATION_GRACE,
  GOAL_GRACE_BLOCK_MESSAGE,
  GOAL_LIMIT_REACHED,
  goalAdoptionBlockMessage,
  type ResolvedPlanCap,
} from '../domain/planLimits'
import { freeHistoryCutoffDate, HISTORY_LOCKED, HISTORY_LOCKED_MESSAGE, isOlderThanFreeHistory } from '../domain/historyLock'
import { clampPageSize, DEFAULT_OVERLAP_MS, DEFAULT_PAGE_SIZE, pullLowerBound, type PullPageInput } from './cursor'
import type { LocalStore } from './localStore'
import {
  emptyCounts,
  normalizeServerRow,
  PARENT_TABLES,
  SYNCED_TABLES,
  toPushPayload,
  type SyncRow,
  type SyncedTable,
  type TableCounts,
} from './model'
import type { RemoteSync } from './remote'
import { budgetsKeptFromAccountLine } from './summary'

export type SyncError = {
  table: SyncedTable
  id?: string
  message: string
  code?: string
}

export type SyncReport = {
  pulled: number
  pushed: number
  errors: SyncError[]
  /** User-facing merge lines, such as "1 budget kept from your account". */
  summary: string[]
}

export type SignInPreview = {
  local: TableCounts
  server: TableCounts
  /**
   * Set when unsynced device goals plus account goals, minus pending deletes of
   * synced goals, exceed the plan. New goal inserts wait. Other tables still sync.
   */
  goalLimitMessage: string | null
}

type Phase = {
  tables: readonly SyncedTable[]
  tombstones: boolean
}

const PUSH_PHASES: readonly Phase[] = [
  { tables: PARENT_TABLES, tombstones: false },
  { tables: ['income_allocations'], tombstones: false },
  { tables: ['income_allocations'], tombstones: true },
  { tables: PARENT_TABLES, tombstones: true },
]

function isNonBlockingSyncError(error: SyncError): boolean {
  if (error.code === BUDGET_LOCKED || error.code === GOAL_CREATION_GRACE || error.code === HISTORY_LOCKED) return true
  return error.message.includes('Invalid goal in allocations')
}

function isOldHistoryRow(row: SyncRow): boolean {
  if (row.table !== 'expenses' && row.table !== 'income_records') return false
  const date = row.values.date
  return typeof date === 'string' && isOlderThanFreeHistory(date)
}

/**
 * HISTORY_LOCKED is the trigger. PGRST116 and an empty write are the same row
 * hidden by the 90-day SELECT policy. A lower countLive is not a delete.
 */
function isHistoryLockFailure(error: unknown, row: SyncRow): boolean {
  if (errorCode(error) === HISTORY_LOCKED || errorMessage(error).includes(HISTORY_LOCKED)) return true
  if (!isOldHistoryRow(row)) return false
  if (errorCode(error) === 'PGRST116') return true
  const message = errorMessage(error)
  return message.includes('Write returned no row') || message.includes('0 rows') || message.includes('Cannot coerce')
}

function isGoalCreationGrace(error: unknown): boolean {
  if (errorCode(error) === GOAL_CREATION_GRACE) return true
  return error instanceof Error && error.message.includes(GOAL_CREATION_GRACE)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Sync failed.'
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

export class SyncEngine {
  private readonly overlapMs: number
  private readonly pageSize: number

  constructor(
    private readonly local: LocalStore,
    private readonly remote: RemoteSync,
    options?: { overlapMs?: number; pageSize?: number },
  ) {
    this.overlapMs = options?.overlapMs ?? DEFAULT_OVERLAP_MS
    this.pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
  }

  /**
   * Local vs server live counts. Does not upload, adopt, or delete either side.
   * Free history hides expenses and income older than 90 days from countLive.
   * That lower server count is not a delete, and pull does not tombstone a
   * local row just because it was absent from the page.
   */
  async preview(userId: string, plan?: ResolvedPlanCap): Promise<SignInPreview> {
    const resolved = await this.prepareAccount(userId, plan)
    const server = emptyCounts()
    for (const table of SYNCED_TABLES) {
      server[table] = await this.remote.countLive(table, userId)
    }
    return {
      local: this.local.countLive(userId),
      server,
      goalLimitMessage: this.goalLimitMessage(userId, server.goals, resolved),
    }
  }

  /**
   * Assign the signed-in user to local-only rows. Refuses when the combined
   * goals would exceed the plan, and does not assign any rows in that case.
   */
  async adopt(userId: string, plan?: ResolvedPlanCap): Promise<void> {
    const resolved = await this.prepareAccount(userId, plan)
    const serverGoals = await this.remote.countLive('goals', userId)
    const message = this.goalLimitMessage(userId, serverGoals, resolved)
    if (message) throw new DomainError(this.goalBlockCode(resolved), message)
    this.local.adoptUnassigned(userId)
  }

  async sync(userId: string, plan?: ResolvedPlanCap): Promise<SyncReport> {
    const report: SyncReport = { pulled: 0, pushed: 0, errors: [], summary: [] }
    const budgetsKept = { n: 0 }
    let resolved = plan ?? this.local.knownPlan() ?? FREE_PLAN_CAP
    try {
      resolved = await this.prepareAccount(userId, plan)
    } catch (error) {
      report.errors.push({
        table: 'goals',
        message: errorMessage(error),
        code: errorCode(error) ?? 'PLAN_UNRESOLVED',
      })
    }
    try {
      await this.pullAll(userId, report, budgetsKept)
    } catch (error) {
      report.errors.push({ table: 'expenses', message: errorMessage(error), code: errorCode(error) })
      return this.withSummary(report, budgetsKept.n)
    }
    if (resolved.blocksNewGoals === true) this.local.holdUnsyncedGoalCreates(userId)
    else this.local.releaseHeldGoalCreates(userId)
    this.local.holdAllocationsForUnsyncedGoals(userId)
    await this.pushGoalTombstones(userId, report)
    const serverGoals = await this.remote.countLive('goals', userId)
    const message = this.goalLimitMessage(userId, serverGoals, resolved)
    if (message) {
      report.errors.push({ table: 'goals', message, code: this.goalBlockCode(resolved) })
    }
    const blockingBeforePush = this.blockingErrorCount(report)
    await this.pushAll(userId, report, message != null)
    if (this.blockingErrorCount(report) > blockingBeforePush) return this.withSummary(report, budgetsKept.n)
    try {
      await this.pullAll(userId, report, budgetsKept)
    } catch (error) {
      report.errors.push({ table: 'expenses', message: errorMessage(error), code: errorCode(error) })
    }
    return this.withSummary(report, budgetsKept.n)
  }

  /**
   * An omitted plan is the account cap from the caller's subscription row.
   * An explicit plan still wins for the goal cap. The budget clock always comes from the account.
   * A failed lookup leaves the stored clock and the last known plan unchanged.
   * Sync then keeps that plan. Free is used only when this device has never resolved one.
   */
  private async prepareAccount(userId: string, plan?: ResolvedPlanCap): Promise<ResolvedPlanCap> {
    const account = await this.remote.resolveAccount(userId)
    this.local.setBudgetAccess({
      fullBudgeting: account.fullBudgeting,
      accountCreatedAt: account.accountCreatedAt,
      simulateExpired: account.simulateBudgetExpired,
    })
    const resolved = plan ?? account.plan
    this.local.setKnownPlan(resolved)
    this.local.setGoalCreatesBlocked(resolved.blocksNewGoals === true)
    if (resolved.name === 'Free') this.local.setFreeHistoryCutoff(freeHistoryCutoffDate())
    else {
      this.local.releaseHistoryLocks()
      this.local.setFreeHistoryCutoff(null)
    }
    return resolved
  }

  private goalBlockCode(plan: ResolvedPlanCap): string {
    return plan.blocksNewGoals === true ? GOAL_CREATION_GRACE : GOAL_LIMIT_REACHED
  }

  /** Budget-lock, grace, and a deposit waiting on its goal stay on the report and still allow the echo pull. */
  private blockingErrorCount(report: SyncReport): number {
    return report.errors.filter((error) => !isNonBlockingSyncError(error)).length
  }

  private goalLimitMessage(userId: string, serverGoals: number, plan: ResolvedPlanCap): string | null {
    const pendingDeletes = this.local.countPendingGoalDeletes(userId)
    return goalAdoptionBlockMessage({
      plan,
      localGoals: this.local.countUnsyncedLiveGoals(userId),
      serverGoals: Math.max(0, serverGoals - pendingDeletes),
    })
  }

  private withSummary(report: SyncReport, budgetsKept: number): SyncReport {
    const line = budgetsKeptFromAccountLine(budgetsKept)
    if (line) report.summary.push(line)
    return report
  }

  private async pullAll(userId: string, report: SyncReport, budgetsKept: { n: number }): Promise<void> {
    for (const table of SYNCED_TABLES) {
      await this.pullTable(userId, table, report, budgetsKept)
    }
  }

  private async pullTable(
    userId: string,
    table: SyncedTable,
    report: SyncReport,
    budgetsKept: { n: number },
  ): Promise<void> {
    const cursor = this.local.getCursor(userId, table)
    const updatedAtGte = pullLowerBound(cursor, this.overlapMs)
    let after: PullPageInput['after'] = null
    let previousMarker: string | null = null
    let maxSeen = cursor
    let rowErrors = 0

    for (;;) {
      const limit = clampPageSize(this.pageSize)
      const page = await this.remote.pullPage({
        table,
        userId,
        updatedAtGte,
        after,
        limit,
      })
      if (page.length === 0) break
      const lastRaw = page[page.length - 1]
      if (!lastRaw) break
      const lastId = typeof lastRaw.id === 'string' ? lastRaw.id : ''
      const lastUpdated = typeof lastRaw.updated_at === 'string' ? lastRaw.updated_at : ''
      const marker = `${lastUpdated}|${lastId}`
      if (marker === previousMarker) {
        throw new Error(`Pull of ${table} did not advance.`)
      }
      previousMarker = marker

      for (const raw of page) {
        let rowId: string | undefined
        try {
          const remoteRow = normalizeServerRow(table, raw)
          rowId = remoteRow.id
          if (remoteRow.user_id !== userId) {
            throw new Error('Pulled a row for a different user.')
          }
          const applied = this.local.applyServerRow(table, remoteRow)
          budgetsKept.n += applied.budgetsKeptFromAccount
          report.pulled += 1
          if (maxSeen == null || Date.parse(remoteRow.updated_at) > Date.parse(maxSeen)) {
            maxSeen = remoteRow.updated_at
          }
        } catch (error) {
          rowErrors += 1
          report.errors.push({
            table,
            id: rowId,
            message: errorMessage(error),
            code: errorCode(error),
          })
        }
      }

      after = { updatedAt: lastUpdated, id: lastId }
      if (page.length < limit) break
    }

    if (rowErrors === 0 && maxSeen && maxSeen !== cursor) {
      this.local.setCursor(userId, table, maxSeen)
    }
  }

  /** Goal deletes free plan slots, so they land before the cap check. */
  private async pushGoalTombstones(userId: string, report: SyncReport): Promise<void> {
    const dirty = this.local.listDirty('goals', userId)
    for (const row of dirty) {
      await this.pushRow(userId, row, true, report, false)
    }
  }

  private async pushAll(userId: string, report: SyncReport, blockNewGoals: boolean): Promise<void> {
    for (const phase of PUSH_PHASES) {
      for (const table of phase.tables) {
        const dirty = this.local.listDirty(table, userId)
        for (const row of dirty) {
          await this.pushRow(userId, row, phase.tombstones, report, blockNewGoals)
        }
      }
    }
  }

  private async pushRow(
    userId: string,
    row: SyncRow,
    tombstones: boolean,
    report: SyncReport,
    blockNewGoals: boolean,
  ): Promise<void> {
    const isTombstone = row.deleted_at != null
    if (isTombstone !== tombstones) return
    if (row.user_id !== userId) return
    if (this.local.isHistoryLocked(row.table, row.id)) return
    if (this.allocationTombstoneWaitsForOldIncome(row)) return
    if (blockNewGoals && row.table === 'goals' && !isTombstone && row.base_updated_at == null) return
    if (isTombstone && row.base_updated_at == null) {
      this.local.discardNeverSynced(row.table, row.id)
      return
    }
    if (this.allocationWaitsForGoal(row)) {
      this.local.holdAllocationsForUnsyncedGoals(userId)
      return
    }
    if (this.budgetPushLocked(row.table)) {
      if (!report.errors.some((error) => error.code === BUDGET_LOCKED)) {
        report.errors.push({
          table: row.table,
          message: BUDGET_LOCK_UPGRADE_MESSAGE,
          code: BUDGET_LOCKED,
        })
      }
      return
    }
    const payload = toPushPayload(row)
    if ('deleted_at' in payload && payload.deleted_at == null) {
      throw new Error('Refusing to send a cleared deleted_at.')
    }
    if ('saved_amount' in payload || 'updated_at' in payload) {
      throw new Error('Refusing to send a server-owned column.')
    }
    const revision = row.revision
    const mode = row.base_updated_at == null ? 'insert' : 'update'
    try {
      const stamp = await this.remote.push(row.table, payload, mode)
      this.local.markSynced(row.table, row.id, stamp, revision)
      report.pushed += 1
      if (row.table === 'income_records' && isTombstone && isOldHistoryRow(row)) {
        await this.pushAllocationTombstonesForIncome(userId, row.id, report, blockNewGoals)
      }
    } catch (error) {
      if (row.table === 'income_allocations' && this.allocationWaitsForGoal(row)) {
        this.local.holdAllocationsForUnsyncedGoals(userId)
        return
      }
      if (isHistoryLockFailure(error, row)) {
        this.local.revertQueuedHistoryEdit(row.table, row.id)
        report.errors.push({
          table: row.table,
          id: row.id,
          message: HISTORY_LOCKED_MESSAGE,
          code: HISTORY_LOCKED,
        })
        return
      }
      if (row.table === 'goals' && mode === 'insert' && isGoalCreationGrace(error)) {
        this.local.holdUnsyncedGoalCreates(userId)
        if (!report.errors.some((entry) => entry.code === GOAL_CREATION_GRACE)) {
          report.errors.push({
            table: 'goals',
            id: row.id,
            message: GOAL_GRACE_BLOCK_MESSAGE,
            code: GOAL_CREATION_GRACE,
          })
        }
        return
      }
      report.errors.push({
        table: row.table,
        id: row.id,
        message: errorMessage(error),
        code: errorCode(error),
      })
    }
  }

  /**
   * Allocation tombstones are pushed before the parent income. An old income
   * delete can still be refused, so those allocations wait until that delete lands.
   */
  private allocationTombstoneWaitsForOldIncome(row: SyncRow): boolean {
    if (row.table !== 'income_allocations' || row.deleted_at == null) return false
    const incomeId = row.values.income_record_id
    if (typeof incomeId !== 'string' || incomeId.length === 0) return false
    const income = this.local.getRow('income_records', incomeId)
    if (!income || income.deleted_at == null || !income.dirty) return false
    return isOldHistoryRow(income)
  }

  private async pushAllocationTombstonesForIncome(
    userId: string,
    incomeId: string,
    report: SyncReport,
    blockNewGoals: boolean,
  ): Promise<void> {
    const dirty = this.local.listDirty('income_allocations', userId)
    for (const child of dirty) {
      if (child.values.income_record_id !== incomeId) continue
      await this.pushRow(userId, child, true, report, blockNewGoals)
    }
  }

  private allocationWaitsForGoal(row: SyncRow): boolean {
    if (row.table !== 'income_allocations' || row.deleted_at != null) return false
    const goalId = row.values.goal_id
    if (!goalId) return false
    const goal = this.local.getRow('goals', goalId)
    return goal != null && goal.deleted_at == null && goal.base_updated_at == null
  }

  private budgetPushLocked(table: SyncedTable): boolean {
    if (table !== 'budget_plans' && table !== 'budget_overrides') return false
    return !this.local.budgetEditingAllowed()
  }
}
