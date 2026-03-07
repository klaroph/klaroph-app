'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import GoalsEmptyState from './GoalsEmptyState'
import GoalCard from './GoalCard'

type Goal = {
  id: string
  name: string
  target_amount: number
}

type AllocationRow = {
  goal_id: string
  amount: number
}

export type GoalForActions = {
  id: string
  name: string
  target_amount: number
}

export type GoalSummary = {
  totalSaved: number
  totalTarget: number
  activeGoals: number
  overallPercent: number
  strongestGoal: { name: string; percent: number } | null
}

type GoalListProps = {
  refreshTrigger: number
  onEdit?: (goal: GoalForActions) => void
  onDelete?: (goal: GoalForActions) => void
  onDataLoaded?: (summary: GoalSummary) => void
}

export default function GoalList({ refreshTrigger, onEdit, onDelete, onDataLoaded }: GoalListProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [allocationsByGoal, setAllocationsByGoal] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGoals = async (getIsMounted: () => boolean) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!getIsMounted()) return
      if (!user) {
        setGoals([])
        setAllocationsByGoal({})
        setError('Not authenticated.')
        setLoading(false)
        return
      }

      const { data: goalsData, error: goalsError } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: false })
      if (!getIsMounted()) return
      if (goalsError) {
        setGoals([])
        setAllocationsByGoal({})
        setError(goalsError.message)
        setLoading(false)
        return
      }

      const goalsList = (goalsData || []) as Goal[]
      if (!getIsMounted()) return
      setGoals(goalsList)

      if (goalsList.length === 0) {
        setAllocationsByGoal({})
        onDataLoaded?.({
          totalSaved: 0,
          totalTarget: 0,
          activeGoals: 0,
          overallPercent: 0,
          strongestGoal: null,
        })
        setLoading(false)
        return
      }

      const goalIds = goalsList.map((g) => g.id)
      const { data: allocData, error: allocError } = await supabase
        .from('income_allocations')
        .select('goal_id, amount')
        .in('goal_id', goalIds)

      if (!getIsMounted()) return
      if (allocError) {
        setError(allocError.message)
        setLoading(false)
        return
      }

      const rows = (allocData || []) as AllocationRow[]
      const byGoal: Record<string, number> = {}
      for (const row of rows) {
        byGoal[row.goal_id] = (byGoal[row.goal_id] ?? 0) + Number(row.amount)
      }
      if (!getIsMounted()) return
      setAllocationsByGoal(byGoal)

      const totalSaved = goalsList.reduce((sum, g) => sum + (byGoal[g.id] ?? 0), 0)
      const totalTarget = goalsList.reduce((sum, g) => sum + (Number(g.target_amount) || 0), 0)
      const overallPercent = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0
      const withPct = goalsList
        .map((g) => ({
          name: g.name,
          percent: (Number(g.target_amount) || 0) > 0
            ? Math.min(100, ((byGoal[g.id] ?? 0) / Number(g.target_amount)) * 100)
            : 0,
        }))
        .filter((x) => x.percent < 100)
        .sort((a, b) => b.percent - a.percent)
      const strongestGoal = withPct[0] ? { name: withPct[0].name, percent: withPct[0].percent } : null
      onDataLoaded?.({
        totalSaved,
        totalTarget,
        activeGoals: goalsList.length,
        overallPercent,
        strongestGoal,
      })

      setLoading(false)
    } catch (err) {
      if (!getIsMounted()) return
      setGoals([])
      setAllocationsByGoal({})
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    loadGoals(() => isMounted)
    return () => {
      isMounted = false
    }
  }, [refreshTrigger])

  if (loading) {
    return (
      <p style={{ margin: 0, padding: 24, fontSize: 14, color: '#6b7280' }}>
        Loading your goals...
      </p>
    )
  }

  if (error) {
    return (
      <p style={{ margin: 0, padding: 24, fontSize: 14, color: '#b91c1c' }}>
        {error}
      </p>
    )
  }

  if (goals.length === 0) {
    return <GoalsEmptyState />
  }

  return (
    <div className="goals-grid goals-grid-premium">
      {goals.map((goal) => {
        const allocated = allocationsByGoal[goal.id] ?? 0
        const target = Number(goal.target_amount) || 0
        const goalForActions: GoalForActions = { id: goal.id, name: goal.name, target_amount: target }
        return (
          <GoalCard
            key={goal.id}
            name={goal.name}
            targetAmount={target}
            allocatedAmount={allocated}
            goal={goalForActions}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
