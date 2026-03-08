/**
 * Global formatting: MM/DD/YYYY, currency with ₱ and comma separators.
 * Negative amounts use parentheses; tabular numbers for alignment.
 */

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). Use for month boundaries and range start/end. */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Format date as MM/DD/YYYY */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

/** Format number with comma separators (no currency symbol) */
export function formatNumber(value: number, decimals = 0): string {
  const abs = Math.abs(value)
  const s = decimals > 0 ? abs.toFixed(decimals) : String(Math.round(abs))
  const [int, frac] = s.split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const out = frac ? `${withCommas}.${frac}` : withCommas
  return value < 0 ? `(${out})` : out
}

/** Format as currency: ₱ and comma separators; negative in () */
export function formatCurrency(value: number, decimals = 0): string {
  const formatted = formatNumber(value, decimals)
  if (value < 0) return `₱${formatted}` // formatted already has ()
  return `₱${formatted}`
}

/** Tabular numbers class for alignment in tables */
export const TABULAR_NUMBERS_CLASS = 'tabular-nums'
