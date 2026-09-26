'use client'

import type { GoalRunwayCopy } from '@/lib/goalRunway'
import type { GoalListItem } from '@/lib/goalsSummary'
import GoalsEmptyState from './GoalsEmptyState'
import GoalCard from './GoalCard'

export type GoalForActions = {
  id: string
  name: string
  target_amount: number
}

type GoalListProps = {
  goals: GoalListItem[]
  allocationsByGoal: Record<string, number>
  runwayByGoal: Record<string, GoalRunwayCopy | null>
  loading: boolean
  error: string | null
  onEdit?: (goal: GoalForActions) => void
  onDelete?: (goal: GoalForActions) => void
  onAddClick?: () => void
}

export default function GoalList({
  goals,
  allocationsByGoal,
  runwayByGoal,
  loading,
  error,
  onEdit,
  onDelete,
  onAddClick,
}: GoalListProps) {
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
    return <GoalsEmptyState onAddClick={onAddClick} />
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
            runwayCopy={runwayByGoal[goal.id] ?? null}
            goal={goalForActions}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
