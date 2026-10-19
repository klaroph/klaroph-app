/**
 * Live synced rows only.
 * Soft-deleted tombstones stay in the table for a later pull. Product reads skip them.
 */
export function liveOnly<T extends { is: (column: string, value: null) => T }>(query: T): T {
  return query.is('deleted_at', null)
}
