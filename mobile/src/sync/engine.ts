import { DEFAULT_OVERLAP_MS, DEFAULT_PAGE_SIZE, pullLowerBound, type PullPageInput } from './cursor'
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
}

export type SignInPreview = {
  local: TableCounts
  server: TableCounts
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

  /** Local vs server live counts. Does not upload or delete either side. */
  async preview(userId: string): Promise<SignInPreview> {
    const server = emptyCounts()
    for (const table of SYNCED_TABLES) {
      server[table] = await this.remote.countLive(table, userId)
    }
    return { local: this.local.countLive(userId), server }
  }

  /** Assign the signed-in user to local-only rows. Call this only after confirmation. */
  adopt(userId: string): void {
    this.local.adoptUnassigned(userId)
  }

  async sync(userId: string): Promise<SyncReport> {
    const report: SyncReport = { pulled: 0, pushed: 0, errors: [] }
    try {
      await this.pullAll(userId, report)
    } catch (error) {
      report.errors.push({ table: 'expenses', message: errorMessage(error), code: errorCode(error) })
      return report
    }
    const errorsAfterPull = report.errors.length
    await this.pushAll(userId, report)
    if (report.errors.length > errorsAfterPull) return report
    try {
      await this.pullAll(userId, report)
    } catch (error) {
      report.errors.push({ table: 'expenses', message: errorMessage(error), code: errorCode(error) })
    }
    return report
  }

  private async pullAll(userId: string, report: SyncReport): Promise<void> {
    for (const table of SYNCED_TABLES) {
      await this.pullTable(userId, table, report)
    }
  }

  private async pullTable(userId: string, table: SyncedTable, report: SyncReport): Promise<void> {
    const cursor = this.local.getCursor(userId, table)
    const updatedAtGte = pullLowerBound(cursor, this.overlapMs)
    let after: PullPageInput['after'] = null
    let previousMarker: string | null = null
    let maxSeen = cursor
    let rowErrors = 0

    for (;;) {
      const page = await this.remote.pullPage({
        table,
        userId,
        updatedAtGte,
        after,
        limit: this.pageSize,
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
          this.local.applyServerRow(table, remoteRow)
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
      if (page.length < this.pageSize) break
    }

    if (rowErrors === 0 && maxSeen && maxSeen !== cursor) {
      this.local.setCursor(userId, table, maxSeen)
    }
  }

  private async pushAll(userId: string, report: SyncReport): Promise<void> {
    for (const phase of PUSH_PHASES) {
      for (const table of phase.tables) {
        const dirty = this.local.listDirty(table, userId)
        for (const row of dirty) {
          await this.pushRow(userId, row, phase.tombstones, report)
        }
      }
    }
  }

  private async pushRow(
    userId: string,
    row: SyncRow,
    tombstones: boolean,
    report: SyncReport,
  ): Promise<void> {
    const isTombstone = row.deleted_at != null
    if (isTombstone !== tombstones) return
    if (row.user_id !== userId) return
    if (isTombstone && row.base_updated_at == null) {
      this.local.discardNeverSynced(row.table, row.id)
      return
    }
    const payload = toPushPayload(row)
    if ('deleted_at' in payload && payload.deleted_at == null) {
      throw new Error('Refusing to send a cleared deleted_at.')
    }
    if ('saved_amount' in payload || 'updated_at' in payload) {
      throw new Error('Refusing to send a server-owned column.')
    }
    try {
      const stamp = await this.remote.push(row.table, payload)
      this.local.markSynced(row.table, row.id, stamp)
      report.pushed += 1
    } catch (error) {
      report.errors.push({
        table: row.table,
        id: row.id,
        message: errorMessage(error),
        code: errorCode(error),
      })
    }
  }
}
