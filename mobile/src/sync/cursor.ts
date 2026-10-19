import { DomainError } from '../domain/errors'
import type { SyncedTable } from './model'

/** Re-read this much history so an in-flight commit with an earlier timestamp is not skipped. */
export const DEFAULT_OVERLAP_MS = 5 * 60 * 1000

export const DEFAULT_PAGE_SIZE = 200

export function pullLowerBound(cursor: string | null, overlapMs: number): string | null {
  if (cursor == null) return null
  const ms = Date.parse(cursor)
  if (!Number.isFinite(ms)) {
    throw new DomainError('INVALID_DATE', 'Invalid sync cursor.')
  }
  return new Date(ms - overlapMs).toISOString()
}

/** PostgREST `or` values are dot-separated, so timestamps must be quoted. */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function keysetOr(updatedAt: string, id: string): string {
  const timestamp = quotePostgrestValue(updatedAt)
  const rowId = quotePostgrestValue(id)
  return `updated_at.gt.${timestamp},and(updated_at.eq.${timestamp},id.gt.${rowId})`
}

export type PullPageInput = {
  table: SyncedTable
  userId: string
  updatedAtGte: string | null
  after: { updatedAt: string; id: string } | null
  limit: number
}
