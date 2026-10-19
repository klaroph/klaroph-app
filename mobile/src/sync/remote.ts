import type { ResolvedPlanCap } from '../domain/planLimits'
import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'

/** Insert fires row triggers. Update does not, so acknowledged rows must not be upserted. */
export type PushMode = 'insert' | 'update'

/** Account plan and budget clock, from `get_user_features` plus the signed-in user. */
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
   * Reads `get_user_features(p_user_id)` with the user session.
   * Throws when that call fails. The app does not use the service role.
   */
  resolveAccount(userId: string): Promise<AccountFeatures>
}
