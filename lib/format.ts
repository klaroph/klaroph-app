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

/**
 * Parse YYYY-MM-DD as local date (avoids Safari interpreting as UTC).
 * Use for date-only strings from API or state; do not use new Date(str) for YYYY-MM-DD.
 */
export function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 0, ((m ?? 1) - 1), d ?? 1)
}

/** Format date as MM/DD/YYYY. Parses YYYY-MM-DD strings as local to avoid Safari UTC shift. */
export function formatDate(date: Date | string): string {
  const d =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
      ? parseLocalDateString(date)
      : typeof date === 'string'
        ? new Date(date)
        : date
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

/** Shorten a YYYY-MM-DD string to YY-MM-DD for compact tables. */
export function formatShortIsoDate(s: string): string {
  return s.slice(2, 10)
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

/**
 * Accounting-style peso display for an already-formatted absolute amount:
 * ₱1,250.00 when positive or zero, (₱1,250.00) when negative.
 * Negatives that round to zero in the display render as ₱0 rather than (₱0).
 */
export function formatSignedPeso(value: number, absoluteText: string): string {
  const text = `₱${absoluteText}`
  return value < 0 && /[1-9]/.test(absoluteText) ? `(${text})` : text
}

/** Peso amount with the caller's locale/precision (same options as Number#toLocaleString); negative in (). */
export function formatPeso(value: number, locale?: string, options?: Intl.NumberFormatOptions): string {
  return formatSignedPeso(value, Math.abs(value).toLocaleString(locale, options))
}

/** Whole-peso en-PH amount (e.g. ₱1,250 or (₱1,250)) for summaries, charts, and insight copy. */
export function formatWholePeso(value: number): string {
  return formatPeso(value, 'en-PH', { maximumFractionDigits: 0 })
}

/** Format as currency: ₱ and comma separators; negative in () */
export function formatCurrency(value: number, decimals = 0): string {
  return formatSignedPeso(value, formatNumber(Math.abs(value), decimals))
}
