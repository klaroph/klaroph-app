import { DomainError } from './errors'

/**
 * Payday periods in Asia/Manila (Philippines, UTC+8, no daylight saving).
 * The first half is the 1st through the 15th. The second half is the 16th
 * through the last calendar day of that month.
 *
 * This is the in-app time unit. It is not the payday-email window, which
 * fires on the 15th and the last day and covers a different inclusive range.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export type PayHalf = 'first' | 'second'

export type CivilDate = {
  year: number
  month: number
  day: number
}

export type PayPeriod = {
  half: PayHalf
  /** Manila calendar month, YYYY-MM. */
  month: string
  /** Inclusive Manila date, YYYY-MM-DD. */
  start: string
  /** Inclusive Manila date, YYYY-MM-DD. */
  end: string
}

export function manilaCivilDate(instant: Date): CivilDate {
  const ms = instant.getTime()
  if (!Number.isFinite(ms)) {
    throw new DomainError('INVALID_DATE', 'Invalid instant.')
  }
  const manila = new Date(ms + MANILA_OFFSET_MS)
  return {
    year: manila.getUTCFullYear(),
    month: manila.getUTCMonth() + 1,
    day: manila.getUTCDate(),
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Pay period that contains a Manila calendar date. */
export function payPeriodForCivilDate(date: CivilDate): PayPeriod {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw new DomainError('INVALID_DATE', 'Invalid calendar date.')
  }
  if (date.month < 1 || date.month > 12) {
    throw new DomainError('INVALID_DATE', 'Invalid calendar date.')
  }
  const lastDay = daysInMonth(date.year, date.month)
  if (date.day < 1 || date.day > lastDay) {
    throw new DomainError('INVALID_DATE', 'Invalid calendar date.')
  }

  if (date.day <= 15) {
    return {
      half: 'first',
      month: monthKey(date.year, date.month),
      start: ymd(date.year, date.month, 1),
      end: ymd(date.year, date.month, 15),
    }
  }

  return {
    half: 'second',
    month: monthKey(date.year, date.month),
    start: ymd(date.year, date.month, 16),
    end: ymd(date.year, date.month, lastDay),
  }
}

/** Pay period that contains an instant, using the Manila calendar date. */
export function payPeriodAt(instant: Date): PayPeriod {
  return payPeriodForCivilDate(manilaCivilDate(instant))
}
