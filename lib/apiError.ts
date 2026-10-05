/**
 * Plain client copy for database / Supabase / Postgres failures.
 * Product and validation messages stay at the call site. This module does not
 * translate those codes into their own copy.
 */
export const plainDbErrorText = {
  save: 'Couldn’t save that.',
  delete: 'Couldn’t delete that.',
  load: 'Couldn’t load that.',
  generic: 'Something went wrong.',
} as const

export type DbErrorIntent = keyof typeof plainDbErrorText

type QuotaErrorLike = {
  message?: string | null
  details?: string | null
  code?: string | null
}

const IMPORT_COUNT_PROTECT_MESSAGE = 'import_count is not updatable by client'

/**
 * Free-import limit from consume_import_quota, including the PR #8 protect
 * trigger (SQLSTATE 42501, "import_count is not updatable by client").
 * Other 42501 errors, such as permission denied, are not this path.
 * Callers return their existing import-limit body; this does not build that copy.
 */
export function isImportQuotaExceededError(error: QuotaErrorLike | null | undefined): boolean {
  if (!error) return false
  const text = `${error.message ?? ''}\n${error.details ?? ''}`
  if (text.includes('IMPORT_QUOTA_EXCEEDED')) return true
  if (!text.includes(IMPORT_COUNT_PROTECT_MESSAGE)) return false
  return error.code == null || error.code === '' || error.code === '42501' || text.includes('42501')
}

/**
 * Log the raw database error, then return a plain bucket for `intent`.
 * Does not recognize product codes (goal limit, grace, import quota, validation).
 */
export function plainDbError(error: unknown, intent: DbErrorIntent, logLabel = 'Database error'): string {
  console.error(logLabel, error)
  return plainDbErrorText[intent] ?? plainDbErrorText.generic
}
