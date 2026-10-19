import type { ServerRow, ServerStamp, SyncRow, SyncedTable, TableCounts } from './model'

export interface LocalStore {
  listDirty(table: SyncedTable, userId: string): SyncRow[]
  getRow(table: SyncedTable, id: string): SyncRow | null
  applyServerRow(table: SyncedTable, row: ServerRow): void
  markSynced(table: SyncedTable, id: string, stamp: ServerStamp): void
  discardNeverSynced(table: SyncedTable, id: string): void
  getCursor(userId: string, table: SyncedTable): string | null
  setCursor(userId: string, table: SyncedTable, cursor: string): void
  /** Live rows for this user plus rows that still have no user. */
  countLive(userId: string): TableCounts
  clearAll(): void
  adoptUnassigned(userId: string): void
  sessionUserId(): string | null
  setSessionUserId(userId: string | null): void
}
