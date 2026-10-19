import type { ResolvedPlanCap } from '../domain/planLimits'
import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'

/** Insert fires row triggers. Update does not, so acknowledged rows must not be upserted. */
export type PushMode = 'insert' | 'update'

/** Account plan and budget clock, from the caller's subscription row plus the signed-in user. */
export type AccountFeatures = {
  plan: ResolvedPlanCap
  fullBudgeting: boolean
  accountCreatedAt: string | null
  simulateBudgetExpired: boolean
}

export interface RemoteSync {
  pullPage(input: PullPageInput): Promise<Record<string, unknown>[]>
  push(table: SyncedTable, payload: Record<string, unknown>, mode: PushMode): Promise<ServerStamp>
  countLive(table: SyncedTable, userId: string): Promise<number>
  /**
   * Reads the caller's `subscriptions` row (RLS `subscriptions_select_own`) and `plans`.
   * Throws when that read fails. Does not call `get_user_features`.
   */
  resolveAccount(userId: string): Promise<AccountFeatures>
}
