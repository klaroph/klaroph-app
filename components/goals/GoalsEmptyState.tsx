'use client'

type GoalsEmptyStateProps = {
  onAddClick?: () => void
}

export default function GoalsEmptyState({ onAddClick }: GoalsEmptyStateProps) {
  return (
    <div className="goals-empty-state">
      <p className="goals-empty-state-title">No goals yet</p>
      <p className="goals-empty-state-body">
        Set your first savings goal and start building momentum.
      </p>
      {onAddClick && (
        <button type="button" onClick={onAddClick} className="btn-primary">
          Add your first goal
        </button>
      )}
    </div>
  )
}
