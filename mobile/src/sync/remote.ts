import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'

export interface RemoteSync {
  pullPage(input: PullPageInput): Promise<Record<string, unknown>[]>
  push(table: SyncedTable, payload: Record<string, unknown>): Promise<ServerStamp>
  countLive(table: SyncedTable, userId: string): Promise<number>
}
