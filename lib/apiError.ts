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

/**
 * True when consume_import_quota reports the free import limit.
 * Matches only IMPORT_QUOTA_EXCEEDED in the message or details, same as main.
 * Callers return their existing import-limit body; this does not build that copy.
 * The 42501 import_count protect error is not this path.
 */
export function isImportQuotaExceededError(error: QuotaErrorLike | null | undefined): boolean {
  if (!error) return false
  const text = `${error.message ?? ''}\n${error.details ?? ''}`
  return text.includes('IMPORT_QUOTA_EXCEEDED')
}

/**
 * Log the raw database error, then return a plain bucket for `intent`.
 * Does not recognize product codes (goal limit, grace, import quota, validation).
 */
export function plainDbError(error: unknown, intent: DbErrorIntent, logLabel = 'Database error'): string {
  console.error(logLabel, error)
  return plainDbErrorText[intent] ?? plainDbErrorText.generic
}
