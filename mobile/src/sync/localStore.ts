import type { BudgetAccess } from '../domain/budgetLock'
import type { ResolvedPlanCap } from '../domain/planLimits'
import type { ServerRow, ServerStamp, SyncRow, SyncedTable, TableCounts } from './model'

export type ApplyServerResult = {
  /** Live local budget rows tombstoned so the account row could be stored. */
  budgetsKeptFromAccount: number
}

export interface LocalStore {
  listDirty(table: SyncedTable, userId: string): SyncRow[]
  getRow(table: SyncedTable, id: string): SyncRow | null
  applyServerRow(table: SyncedTable, row: ServerRow): ApplyServerResult
  /**
   * Records the server stamp. Leaves the row dirty when `revision` is no longer
   * the revision that was pushed, and still advances `base_updated_at` so the
   * echo of that push does not overwrite the newer local edit.
   */
  markSynced(table: SyncedTable, id: string, stamp: ServerStamp, revision: number): void
  discardNeverSynced(table: SyncedTable, id: string): void
  getCursor(userId: string, table: SyncedTable): string | null
  setCursor(userId: string, table: SyncedTable, cursor: string): void
  /** Live rows for this user plus rows that still have no user. */
  countLive(userId: string): TableCounts
  /**
   * Live goals on this device that have never been acknowledged by the server.
   * Includes rows that still have no user. Excludes goals already pulled or pushed,
   * so a later sync does not count the same goal twice.
   */
  countUnsyncedLiveGoals(userId: string): number
  /** Synced goals this device has tombstoned and not yet pushed. */
  countPendingGoalDeletes(userId: string): number
  clearAll(): void
  adoptUnassigned(userId: string): void
  sessionUserId(): string | null
  setSessionUserId(userId: string | null): void
  /** Remembers the signed-in budget clock. `null` forgets it (sign-out clears this with the other meta). */
  setBudgetAccess(access: BudgetAccess | null): void
  /**
   * True when no clock is stored yet, and otherwise the web 30-day Free rule.
   * Local-only writes do not call this; they skip the lock because they have no account.
   */
  budgetEditingAllowed(): boolean
  /** Signed-in creates throw while past-due grace blocks new goals. `false` clears it. */
  setGoalCreatesBlocked(blocked: boolean): void
  goalCreatesBlocked(): boolean
  /** Last plan resolved for this device. Sign-out clears it with the other meta. */
  setKnownPlan(plan: ResolvedPlanCap): void
  knownPlan(): ResolvedPlanCap | null
  /**
   * Clears dirty on live goals this account has never synced.
   * They stay on the device and leave the push queue.
   */
  holdUnsyncedGoalCreates(userId: string): number
  /** Puts those held creates back on the push queue after grace ends. */
  releaseHeldGoalCreates(userId: string): void
  /**
   * Clears dirty on live allocations whose goal has not been acknowledged.
   * They stay on the device until that goal uploads.
   */
  holdAllocationsForUnsyncedGoals(userId: string): void
  /** Puts a held goal's allocations back on the push queue after the goal uploads. */
  releaseAllocationsForGoal(goalId: string): void
}
