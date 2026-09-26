import { useEffect, useState } from 'react'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import {
  computeGoalRunway,
  formatGoalRunwayCopy,
  type GoalAllocationEvent,
  type GoalRunwayCopy,
} from '@/lib/goalRunway'
import {
  EMPTY_GOAL_SUMMARY,
  summarizeGoals,
  type GoalListItem,
  type GoalSummary,
} from '@/lib/goalsSummary'

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
  return typeof date === 'string' && date.trim() ? date.trim() : null
}

/**
 * Goals page data: one goals query + one allocations query feed the hero summary,
 * goal count, and goal cards. `hasLoaded` flips once after the first load settles.
 */
export function useGoalsData(refreshTrigger: number) {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [allocationsByGoal, setAllocationsByGoal] = useState<Record<string, number>>({})
  const [runwayByGoal, setRunwayByGoal] = useState<Record<string, GoalRunwayCopy | null>>({})
  const [summary, setSummary] = useState<GoalSummary>(EMPTY_GOAL_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const settle = () => {
      setLoading(false)
      setHasLoaded(true)
    }

    const loadGoals = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data: { user } } = await getBrowserUser()
        if (!isMounted) return
        if (!user) {
          setGoals([])
          setAllocationsByGoal({})
          setRunwayByGoal({})
          setError('Not authenticated.')
          settle()
          return
        }

        const { data: goalsData, error: goalsError } = await supabase
          .from('goals')
          .select('*')
          .order('created_at', { ascending: false })
        if (!isMounted) return
        if (goalsError) {
          setGoals([])
          setAllocationsByGoal({})
          setRunwayByGoal({})
          setError(goalsError.message)
          settle()
          return
        }

        const goalsList = (goalsData || []) as GoalListItem[]
        setGoals(goalsList)

        if (goalsList.length === 0) {
          setAllocationsByGoal({})
          setRunwayByGoal({})
          setSummary(EMPTY_GOAL_SUMMARY)
          settle()
          return
        }

        const goalIds = goalsList.map((g) => g.id)
        const { data: allocData, error: allocError } = await supabase
          .from('income_allocations')
          .select('goal_id, amount, income_records(date)')
          .in('goal_id', goalIds)

        if (!isMounted) return
        if (allocError) {
          setError(allocError.message)
          settle()
          return
        }

        const rows = (allocData || []) as AllocationJoinRow[]
        const byGoal: Record<string, number> = {}
        const eventsByGoal: Record<string, GoalAllocationEvent[]> = {}

        for (const row of rows) {
          const amt = Number(row.amount)
          byGoal[row.goal_id] = (byGoal[row.goal_id] ?? 0) + amt
          const incomeDate = incomeDateFromJoin(row.income_records)
          if (incomeDate) {
            if (!eventsByGoal[row.goal_id]) eventsByGoal[row.goal_id] = []
            eventsByGoal[row.goal_id].push({ amount: amt, incomeDate })
          }
        }

        const runwayMap: Record<string, GoalRunwayCopy | null> = {}
        for (const g of goalsList) {
          const runway = computeGoalRunway({
            target: Number(g.target_amount) || 0,
            saved: byGoal[g.id] ?? 0,
            events: eventsByGoal[g.id] ?? [],
          })
          runwayMap[g.id] = formatGoalRunwayCopy(runway)
        }

        setAllocationsByGoal(byGoal)
        setRunwayByGoal(runwayMap)
        setSummary(summarizeGoals(goalsList, byGoal))
        settle()
      } catch (err) {
        if (!isMounted) return
        setGoals([])
        setAllocationsByGoal({})
        setRunwayByGoal({})
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        settle()
      }
    }

    loadGoals()
    return () => {
      isMounted = false
    }
  }, [refreshTrigger])

  return { goals, allocationsByGoal, runwayByGoal, summary, loading, hasLoaded, error }
}
