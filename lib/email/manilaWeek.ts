/**
 * Manila calendar weeks for the weekly summary.
 * The Philippines is UTC+8 all year (no daylight saving), so Manila midnight is a
 * fixed UTC instant — the same offset lib/founder/report.ts manilaReportWindow uses.
 *
 * The covered week is the most recently completed Monday 00:00 through Sunday 23:59
 * in Asia/Manila. The comparison week is the seven days before that.
 * Bounds are inclusive YYYY-MM-DD dates, which is how income and expense rows are stored.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Inclusive Manila calendar dates, YYYY-MM-DD. */
export type ManilaDateRange = { start: string; end: string }

export type ManilaWeekWindow = {
  /** Monday the covered week starts (YYYY-MM-DD). Also the campaign id date. */
  startMonday: string
  covered: ManilaDateRange
  previous: ManilaDateRange
}

function manilaMidnightUtc(now: Date): number {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS)
  return Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()) - MANILA_OFFSET_MS
}

function ymd(midnightUtcMs: number): string {
  return new Date(midnightUtcMs + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function rangeFromMonday(mondayUtcMs: number): ManilaDateRange {
  return { start: ymd(mondayUtcMs), end: ymd(mondayUtcMs + 6 * DAY_MS) }
}

export function manilaWeekWindow(now: Date): ManilaWeekWindow {
  const todayStart = manilaMidnightUtc(now)
  const weekday = new Date(todayStart + MANILA_OFFSET_MS).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const thisMonday = todayStart - daysSinceMonday * DAY_MS
  const coveredMonday = thisMonday - 7 * DAY_MS
  const covered = rangeFromMonday(coveredMonday)
  return {
    startMonday: covered.start,
    covered,
    previous: rangeFromMonday(coveredMonday - 7 * DAY_MS),
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Inclusive YYYY-MM-DD match. Timestamps and other shapes do not count. */
export function manilaDateInRange(date: string, range: ManilaDateRange): boolean {
  return YMD.test(date) && date >= range.start && date <= range.end
}

/** marketing_email_sends.campaign_id allows this shape; it is not a CAMPAIGNS id. */
export function weeklyCampaignId(window: ManilaWeekWindow): string {
  return `week-${window.startMonday}`
}
