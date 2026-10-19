/**
 * Live synced rows only.
 * Soft-deleted tombstones stay in the table for a later pull. Product reads skip them.
 */
export function liveOnly<T extends { is: (column: string, value: null) => T }>(query: T): T {
  return query.is('deleted_at', null)
}

/**
 * Soft-delete one live synced row. The database trigger replaces deleted_at with now(),
 * so a client timestamp cannot backdate the tombstone or purge it early.
 */
export function softDelete<T extends { is: (column: string, value: null) => T }>(
  query: { update: (values: { deleted_at: string }) => T }
): T {
  return liveOnly(query.update({ deleted_at: new Date().toISOString() }))
}
