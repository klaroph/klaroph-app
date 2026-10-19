import { DomainError } from './errors'

/**
 * In-app payday periods in Asia/Manila (UTC+8, no daylight saving).
 * They match the payday email window:
 * period A is the previous month's last day through the 14th;
 * period B is the 15th through the day before this month's last day.
 * The last day of a month is the start of the next month's period A.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export type PayHalf = 'a' | 'b'

export type CivilDate = {
  year: number
  month: number
  day: number
}

export type PayPeriod = {
  half: PayHalf
  /** Manila calendar month the period belongs to, YYYY-MM. */
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

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

function periodA(year: number, month: number): PayPeriod {
  const previous = shiftMonth(year, month, -1)
  return {
    half: 'a',
    month: monthKey(year, month),
    start: ymd(previous.year, previous.month, daysInMonth(previous.year, previous.month)),
    end: ymd(year, month, 14),
  }
}

function periodB(year: number, month: number): PayPeriod {
  const lastDay = daysInMonth(year, month)
  return {
    half: 'b',
    month: monthKey(year, month),
    start: ymd(year, month, 15),
    end: ymd(year, month, lastDay - 1),
  }
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
  if (date.day === lastDay) {
    const next = shiftMonth(date.year, date.month, 1)
    return periodA(next.year, next.month)
  }
  if (date.day <= 14) return periodA(date.year, date.month)
  return periodB(date.year, date.month)
}

/** Pay period that contains an instant, using the Manila calendar date. */
export function payPeriodAt(instant: Date): PayPeriod {
  return payPeriodForCivilDate(manilaCivilDate(instant))
}
