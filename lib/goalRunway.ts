/**
 * Deterministic goal runway (estimated months to goal).
 * Pace = average of the most recent up to 3 calendar months that have contributions,
 * keyed by parent income_records.date (allocations have no date of their own).
 */

export const GOAL_RUNWAY_MAX_PACE_MONTHS = 3
/** Soft display cap so tiny paces don't show absurd numbers. */
export const GOAL_RUNWAY_DISPLAY_MONTHS_CAP = 100

export type GoalRunwayStatus = 'complete' | 'no_pace' | 'estimate'

export type GoalRunwayResult = {
  status: GoalRunwayStatus
  saved: number
  remaining: number
  /** Average ₱/month across contribution months used for pace (0 when no_pace/complete). */
  pace: number
  /** ceil(remaining / pace); null when not an estimate. Capped for display separately. */
  monthsRemaining: number | null
  /** How many contribution months entered the average. */
  contributionMonthCount: number
}

export type GoalAllocationEvent = {
  amount: number
  /** Parent income date as YYYY-MM-DD (or any string whose first 7 chars are YYYY-MM). */
  incomeDate: string
}

function toFiniteNumber(n: number): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function monthKeyFromIncomeDate(incomeDate: string): string | null {
  const s = (incomeDate ?? '').trim()
  if (s.length < 7) return null
  const key = s.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(key)) return null
  return key
}

/**
 * Sum allocations into calendar months using parent income dates.
 * Returns map YYYY-MM → total amount for that month.
 */
export function monthlyTotalsFromAllocations(
  events: GoalAllocationEvent[]
): Record<string, number> {
  const byMonth: Record<string, number> = {}
  for (const ev of events) {
    const amount = toFiniteNumber(ev.amount)
    if (amount <= 0) continue
    const key = monthKeyFromIncomeDate(ev.incomeDate)
    if (!key) continue
    byMonth[key] = (byMonth[key] ?? 0) + amount
  }
  return byMonth
}

/**
 * Recent contribution months (with amount > 0), newest first, up to maxMonths.
 */
export function recentContributionMonths(
  byMonth: Record<string, number>,
  maxMonths = GOAL_RUNWAY_MAX_PACE_MONTHS
): { month: string; amount: number }[] {
  return Object.entries(byMonth)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, maxMonths)
    .map(([month, amount]) => ({ month, amount }))
}

export function computeGoalRunway(params: {
  target: number
  /** Sum of all allocations for this goal (canonical saved). */
  saved: number
  /** Allocation events with parent income dates — used only for pace. */
  events: GoalAllocationEvent[]
}): GoalRunwayResult {
  const target = Math.max(0, toFiniteNumber(params.target))
  const saved = Math.max(0, toFiniteNumber(params.saved))
  const remaining = Math.max(0, target - saved)

  if (target <= 0) {
    return {
      status: 'no_pace',
      saved,
      remaining: 0,
      pace: 0,
      monthsRemaining: null,
      contributionMonthCount: 0,
    }
  }

  if (remaining <= 0 || saved >= target) {
    return {
      status: 'complete',
      saved,
      remaining,
      pace: 0,
      monthsRemaining: null,
      contributionMonthCount: 0,
    }
  }

  const byMonth = monthlyTotalsFromAllocations(params.events)
  const recent = recentContributionMonths(byMonth)
  const contributionMonthCount = recent.length

  if (contributionMonthCount === 0) {
    return {
      status: 'no_pace',
      saved,
      remaining,
      pace: 0,
      monthsRemaining: null,
      contributionMonthCount: 0,
    }
  }

  const paceSum = recent.reduce((s, m) => s + m.amount, 0)
  const pace = paceSum / contributionMonthCount

  if (pace <= 0) {
    return {
      status: 'no_pace',
      saved,
      remaining,
      pace: 0,
      monthsRemaining: null,
      contributionMonthCount,
    }
  }

  const monthsRemaining = Math.ceil(remaining / pace)

  return {
    status: 'estimate',
    saved,
    remaining,
    pace,
    monthsRemaining,
    contributionMonthCount,
  }
}

export type GoalRunwayCopy = {
  primary: string
  secondary: string | null
}

/**
 * Plain-language estimate copy for GoalCard.
 * Communicates approximation; never invents a calendar finish date.
 */
export function formatGoalRunwayCopy(runway: GoalRunwayResult): GoalRunwayCopy | null {
  if (runway.status === 'complete') {
    return { primary: 'Goal reached', secondary: null }
  }
  if (runway.status === 'no_pace') {
    return {
      primary: 'Start allocating income to see an estimated timeline.',
      secondary: null,
    }
  }

  const months = runway.monthsRemaining ?? 0
  const displayMonths =
    months > GOAL_RUNWAY_DISPLAY_MONTHS_CAP
      ? GOAL_RUNWAY_DISPLAY_MONTHS_CAP
      : months
  const monthsLabel =
    displayMonths >= GOAL_RUNWAY_DISPLAY_MONTHS_CAP
      ? `${GOAL_RUNWAY_DISPLAY_MONTHS_CAP}+ months`
      : displayMonths === 1
        ? '1 month'
        : `${displayMonths} months`

  const paceRounded = Math.round(runway.pace)
  const paceText = `Averaging about ₱${paceRounded.toLocaleString('en-PH')}/month toward this goal.`

  const primary = `About ${monthsLabel} to go`
  const secondary =
    runway.contributionMonthCount === 1
      ? `${paceText} Based on one contribution month so far.`
      : paceText

  return { primary, secondary }
}
