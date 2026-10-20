import { daysInMonth, manilaCivilDate, payPeriodForCivilDate, type CivilDate, type PayHalf, type PayPeriod } from '../domain/payPeriod'
import { formatPrettyDate, formatWeekdayShort } from './format'

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftIso(isoDate: string, delta: number): string {
  const utc = new Date(Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10))))
  utc.setUTCDate(utc.getUTCDate() + delta)
  return iso(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

/** Payday is the 15th for period A and the month's last day for period B. */
export function paydayIso(period: PayPeriod): string {
  const year = Number(period.month.slice(0, 4))
  const month = Number(period.month.slice(5, 7))
  const half: PayHalf = period.half
  switch (half) {
    case 'a':
      return iso(year, month, 15)
    case 'b':
      return iso(year, month, daysInMonth(year, month))
    default: {
      const neverHalf: never = half
      return neverHalf
    }
  }
}

export function daysBetweenIso(start: string, end: string): number {
  const startMs = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)))
  const endMs = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)))
  return Math.round((endMs - startMs) / 86_400_000)
}

export type PaydayCountdown = {
  days: number
  payday: string
  /** "Sat, Oct 31" */
  paydayLabel: string
  period: PayPeriod
}

export function daysToPayday(date: CivilDate): PaydayCountdown {
  const period = payPeriodForCivilDate(date)
  const payday = paydayIso(period)
  const today = iso(date.year, date.month, date.day)
  return {
    days: daysBetweenIso(today, payday),
    payday,
    paydayLabel: `${formatWeekdayShort(payday)}, ${formatPrettyDate(payday)}`,
    period,
  }
}

export function daysToPaydayOn(isoDate: string): PaydayCountdown {
  return daysToPayday({
    year: Number(isoDate.slice(0, 4)),
    month: Number(isoDate.slice(5, 7)),
    day: Number(isoDate.slice(8, 10)),
  })
}

/** The Manila calendar date decides the count, including across midnight. */
export function daysToPaydayAt(instant: Date): PaydayCountdown {
  return daysToPayday(manilaCivilDate(instant))
}

export function elapsedPeriodDays(period: PayPeriod, today: string): number {
  if (today < period.start) return 0
  const end = today < period.end ? today : period.end
  return daysBetweenIso(period.start, end) + 1
}

export function previousPayPeriod(period: PayPeriod): PayPeriod {
  const day = shiftIso(period.start, -1)
  return payPeriodForCivilDate({
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    day: Number(day.slice(8, 10)),
  })
}

/** "OCT 15 – 30" when the period stays in one month. */
export function kinsenaRange(period: PayPeriod): string {
  const startPretty = formatPrettyDate(period.start).toUpperCase()
  const endPretty = formatPrettyDate(period.end).toUpperCase()
  const sameMonth = period.start.slice(0, 7) === period.end.slice(0, 7)
  if (!sameMonth) return `${startPretty} – ${endPretty}`
  return `${startPretty} – ${String(Number(period.end.slice(8, 10)))}`
}

export function dailyAllowance(left: number, days: number): number {
  if (days <= 0) return 0
  return Math.round(left / days)
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export function manilaGreeting(instant: Date): string {
  const hour = new Date(instant.getTime() + MANILA_OFFSET_MS).getUTCHours()
  if (hour < 12) return 'Magandang umaga'
  if (hour < 18) return 'Magandang hapon'
  return 'Magandang gabi'
}
