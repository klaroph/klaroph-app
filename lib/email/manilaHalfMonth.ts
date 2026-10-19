/**
 * Manila half-months for the payday summary.
 * The Philippines is UTC+8 all year (no daylight saving), so Manila midnight is a
 * fixed UTC instant — the same offset lib/founder/report.ts manilaReportWindow uses.
 *
 * The calendar day is the Manila date of the actual fire time (`now`). It is not
 * read from a cron header or from the schedule's day-of-month list.
 *
 * Half "a" runs on the 15th and covers the previous month's last day through the
 * 14th. Half "b" runs when tomorrow in Manila is the 1st and covers the 15th
 * through the day before that last day. Any other Manila date is not a payday.
 * Bounds are inclusive YYYY-MM-DD dates, which is how income and expense rows are stored.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Inclusive Manila calendar dates, YYYY-MM-DD. */
export type ManilaDateRange = { start: string; end: string }

export type PaydayHalf = 'a' | 'b'

export type ManilaHalfMonthWindow = {
  half: PaydayHalf
  /** YYYY-MM of the Manila month the summary fires in. */
  month: string
  covered: ManilaDateRange
  dayCount: number
}

type CivilDate = { year: number; month: number; day: number }

function manilaCivilDate(now: Date): CivilDate {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS)
  return { year: manila.getUTCFullYear(), month: manila.getUTCMonth() + 1, day: manila.getUTCDate() }
}

function ymd(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function monthKey(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`
}

function plusDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

function inclusiveDayCount(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`)
  const endMs = Date.parse(`${end}T00:00:00.000Z`)
  return Math.round((endMs - startMs) / DAY_MS) + 1
}

function windowFor(half: PaydayHalf, today: CivilDate, covered: ManilaDateRange): ManilaHalfMonthWindow {
  return { half, month: monthKey(today), covered, dayCount: inclusiveDayCount(covered.start, covered.end) }
}

/**
 * The payday window for this fire time, or null when the Manila date is not a payday.
 * Half "a" on the 15th, half "b" on the last day of the month.
 */
export function manilaHalfMonth(now: Date): ManilaHalfMonthWindow | null {
  const today = manilaCivilDate(now)
  if (!Number.isFinite(today.year) || today.day < 1) return null

  if (today.day === 15) {
    const previousLast = plusDays({ year: today.year, month: today.month, day: 1 }, -1)
    return windowFor('a', today, {
      start: ymd(previousLast),
      end: ymd({ year: today.year, month: today.month, day: 14 }),
    })
  }

  const tomorrow = plusDays(today, 1)
  if (tomorrow.day === 1) {
    return windowFor('b', today, {
      start: ymd({ year: today.year, month: today.month, day: 15 }),
      end: ymd(plusDays(today, -1)),
    })
  }

  return null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Inclusive YYYY-MM-DD match. Timestamps and other shapes do not count. */
export function manilaDateInRange(date: string, range: ManilaDateRange): boolean {
  return YMD.test(date) && date >= range.start && date <= range.end
}

/** marketing_email_sends.campaign_id allows this shape; it is not a CAMPAIGNS id. */
export function paydayCampaignId(window: ManilaHalfMonthWindow): string {
  return `half-${window.month}-${window.half}`
}
