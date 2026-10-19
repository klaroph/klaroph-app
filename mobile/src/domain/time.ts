import { DomainError } from './errors'
import { daysInMonth } from './payPeriod'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function canonicalTimestamp(value: string): string {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) {
    throw new DomainError('INVALID_DATE', 'Invalid timestamp.')
  }
  return new Date(ms).toISOString()
}

export function requireIsoDate(value: string, label = 'date'): string {
  const date = value.slice(0, 10)
  if (!DATE_RE.test(date)) {
    throw new DomainError('INVALID_DATE', `Enter a valid ${label}.`)
  }
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const last = daysInMonth(year, month)
  if (month < 1 || month > 12 || day < 1 || day > last) {
    throw new DomainError('INVALID_DATE', `Enter a valid ${label}.`)
  }
  return date
}

/** Budget overrides store the first calendar day of the month. */
export function firstOfMonth(value: string): string {
  const date = requireIsoDate(value, 'month')
  return `${date.slice(0, 7)}-01`
}

export function requireText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new DomainError('INVALID_TEXT', `Enter a ${label}.`)
  }
  return trimmed
}

export function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function optionalNote(value: string | null | undefined): string | null {
  const note = optionalText(value)
  if (note && note.length > 150) {
    throw new DomainError('NOTE_TOO_LONG', 'Note must be 150 characters or fewer.')
  }
  return note
}
