import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'

/** Insert fires row triggers. Update does not, so acknowledged rows must not be upserted. */
export type PushMode = 'insert' | 'update'

export interface RemoteSync {
  pullPage(input: PullPageInput): Promise<Record<string, unknown>[]>
  push(table: SyncedTable, payload: Record<string, unknown>, mode: PushMode): Promise<ServerStamp>
  countLive(table: SyncedTable, userId: string): Promise<number>
}
