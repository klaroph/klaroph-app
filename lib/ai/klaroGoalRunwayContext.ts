/**
 * Ask Klaro goal runway context — reuses lib/goalRunway.ts only.
 * No runway math in the AI layer; no raw transaction descriptions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeGoalRunway,
  formatGoalRunwayCopy,
  GOAL_RUNWAY_DISPLAY_MONTHS_CAP,
  type GoalAllocationEvent,
  type GoalRunwayResult,
  type GoalRunwayStatus,
} from '@/lib/goalRunway'

export type ChatGoalRunwaySlice = {
  status: GoalRunwayStatus
  remaining: number
  pace: number
  monthsRemaining: number | null
  /** monthsRemaining capped the same way GoalCard displays */
  displayMonthsRemaining: number | null
  contributionMonthCount: number
  /** True only when Klaro produced an estimate timeline */
  estimateAvailable: boolean
  primary: string | null
  secondary: string | null
  limitation: string | null
}

export type ChatGoalWithRunway = {
  name: string
  targetAmount: number
  currentAmount: number
  progressPercent: number
  runway: ChatGoalRunwaySlice
}

export type GoalRunwayChatContext = {
  goals: ChatGoalWithRunway[]
  /** Among goals with estimateAvailable — longest display months */
  longestEstimate: { name: string; displayMonthsRemaining: number } | null
  guidance: string
}

type AllocationJoinRow = {
  goal_id: string
  amount: number
  income_records: { date: string } | { date: string }[] | null
}

function incomeDateFromJoin(
  incomeRecords: AllocationJoinRow['income_records']
): string | null {
  if (!incomeRecords) return null
  const row = Array.isArray(incomeRecords) ? incomeRecords[0] : incomeRecords
  const date = row?.date
  if (!date || typeof date !== 'string') return null
  return date.slice(0, 10)
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function displayMonthsFromResult(runway: GoalRunwayResult): number | null {
  if (runway.status !== 'estimate' || runway.monthsRemaining == null) return null
  return Math.min(runway.monthsRemaining, GOAL_RUNWAY_DISPLAY_MONTHS_CAP)
}

function limitationFor(runway: GoalRunwayResult): string | null {
  if (runway.status === 'estimate') return null
  if (runway.status === 'complete') return null
  // no_pace — including zero contribution months or non-positive pace
  if (runway.contributionMonthCount === 0) {
    return 'Not enough income allocation history to estimate a timeline for this goal.'
  }
  return 'Klaro cannot estimate a timeline for this goal from the current contribution pace.'
}

/**
 * Pure mapper: attach runway via computeGoalRunway + formatGoalRunwayCopy.
 * Safe for unit tests without Supabase.
 */
export function mapGoalsWithRunway(
  goals: Array<{
    id: string
    name: string
    targetAmount: number
    currentAmount: number
  }>,
  eventsByGoalId: Record<string, GoalAllocationEvent[]>
): GoalRunwayChatContext {
  const mapped: ChatGoalWithRunway[] = goals.map((g) => {
    const targetAmount = roundMoney(g.targetAmount)
    const currentAmount = roundMoney(g.currentAmount)
    const progressPercent =
      targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0

    const result = computeGoalRunway({
      target: targetAmount,
      saved: currentAmount,
      events: eventsByGoalId[g.id] ?? [],
    })
    const copy = formatGoalRunwayCopy(result)
    const estimateAvailable = result.status === 'estimate'
    const displayMonthsRemaining = displayMonthsFromResult(result)

    return {
      name: g.name,
      targetAmount,
      currentAmount,
      progressPercent,
      runway: {
        status: result.status,
        remaining: result.remaining,
        pace: Math.round(result.pace * 100) / 100,
        monthsRemaining: result.monthsRemaining,
        displayMonthsRemaining,
        contributionMonthCount: result.contributionMonthCount,
        estimateAvailable,
        primary: copy?.primary ?? null,
        secondary: copy?.secondary ?? null,
        limitation: limitationFor(result),
      },
    }
  })

  let longestEstimate: GoalRunwayChatContext['longestEstimate'] = null
  for (const g of mapped) {
    if (!g.runway.estimateAvailable || g.runway.displayMonthsRemaining == null) continue
    if (
      !longestEstimate ||
      g.runway.displayMonthsRemaining > longestEstimate.displayMonthsRemaining
    ) {
      longestEstimate = {
        name: g.name,
        displayMonthsRemaining: g.runway.displayMonthsRemaining,
      }
    }
  }

  return {
    goals: mapped,
    longestEstimate,
    guidance:
      'Runway months and pace are Klaro-calculated. Use them as given. Never invent a finish date or timeline. If estimateAvailable is false, state the limitation honestly.',
  }
}

/**
 * Load goals + allocation events (income dates only) and build runway context.
 */
export async function buildGoalRunwayChatContext(
  supabase: SupabaseClient,
  userId: string
): Promise<GoalRunwayChatContext> {
  const { data: goalsData, error: goalsError } = await supabase
    .from('goals')
    .select('id, name, target_amount')
    .eq('user_id', userId)

  if (goalsError) {
    console.error('[klaro-chat] goal_runway_goals_error', { message: goalsError.message })
    return {
      goals: [],
      longestEstimate: null,
      guidance:
        'Runway months and pace are Klaro-calculated. Use them as given. Never invent a finish date or timeline. If estimateAvailable is false, state the limitation honestly.',
    }
  }

  const goalsList = (goalsData ?? []) as Array<{
    id: string
    name: string
    target_amount: number
  }>

  if (goalsList.length === 0) {
    return mapGoalsWithRunway([], {})
  }

  const goalIds = goalsList.map((g) => g.id)
  const { data: allocData, error: allocError } = await supabase
    .from('income_allocations')
    .select('goal_id, amount, income_records(date)')
    .in('goal_id', goalIds)

  if (allocError) {
    console.error('[klaro-chat] goal_runway_alloc_error', { message: allocError.message })
  }

  const rows = (allocData ?? []) as AllocationJoinRow[]
  const savedByGoal: Record<string, number> = {}
  const eventsByGoalId: Record<string, GoalAllocationEvent[]> = {}

  for (const row of rows) {
    const amt = Number(row.amount) || 0
    savedByGoal[row.goal_id] = (savedByGoal[row.goal_id] ?? 0) + amt
    const incomeDate = incomeDateFromJoin(row.income_records)
    if (incomeDate && amt > 0) {
      if (!eventsByGoalId[row.goal_id]) eventsByGoalId[row.goal_id] = []
      eventsByGoalId[row.goal_id].push({ amount: amt, incomeDate })
    }
  }

  return mapGoalsWithRunway(
    goalsList.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: Number(g.target_amount) || 0,
      currentAmount: savedByGoal[g.id] ?? 0,
    })),
    eventsByGoalId
  )
}
