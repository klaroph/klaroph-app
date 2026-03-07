'use client'

import { getIconKeyForGoalName } from '@/lib/goalPresets'
import { formatCurrency } from '@/lib/format'
import type { GoalForActions } from './GoalList'

const ICON_SIZE = 20

function GoalIcon({ iconKey }: { iconKey: string }) {
  const s = ICON_SIZE
  const stroke = 1.5
  const style = { flexShrink: 0 }
  if (iconKey === 'travel') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} style={style}>
        <path d="M21 16V8a2 2 0 0 0-1.2-1.82l-7-3.5a2 2 0 0 0-1.6 0L3.2 6.18A2 2 0 0 0 2 8v8a2 2 0 0 0 1.2 1.82l7 3.5a2 2 0 0 0 1.6 0l7-3.5A2 2 0 0 0 21 16Z" />
      </svg>
    )
  }
  if (iconKey === 'money') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} style={style}>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }
  if (iconKey === 'education') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} style={style}>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    )
  }
  if (iconKey === 'house') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} style={style}>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    )
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} style={style}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

type GoalCardProps = {
  name: string
  targetAmount: number
  allocatedAmount: number
  targetDate?: string | null
  goal?: GoalForActions
  onEdit?: (goal: GoalForActions) => void
  onDelete?: (goal: GoalForActions) => void
}

export default function GoalCard({
  name,
  targetAmount,
  allocatedAmount,
  targetDate,
  goal,
  onEdit,
  onDelete,
}: GoalCardProps) {
  const pct = targetAmount > 0 ? Math.min(100, (allocatedAmount / targetAmount) * 100) : 0
  const isComplete = pct >= 100
  const iconKey = getIconKeyForGoalName(name)
  const canAct = goal && (onEdit || onDelete)

  return (
    <article className="goal-card-premium" aria-labelledby={goal ? `goal-name-${goal.id}` : undefined}>
      <div className="goal-card-premium-head">
        <div className="goal-card-premium-icon-wrap" aria-hidden>
          <GoalIcon iconKey={iconKey} />
        </div>
        <div className="goal-card-premium-titles">
          <h3 id={goal ? `goal-name-${goal.id}` : undefined} className="goal-card-premium-name">
            {name}
          </h3>
          <p className="goal-card-premium-amount">
            <span className="goal-card-premium-saved">{formatCurrency(allocatedAmount)}</span>
            <span className="goal-card-premium-sep"> / </span>
            <span>{formatCurrency(targetAmount)}</span>
          </p>
          {targetDate && (
            <p className="goal-card-premium-date">Target: {targetDate}</p>
          )}
        </div>
      </div>

      <div className="goal-card-premium-bar-wrap">
        <div
          className="goal-card-premium-bar"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} progress`}
        >
          <div
            className="goal-card-premium-bar-fill"
            style={{ width: `${Math.max(pct, 0)}%` }}
          />
        </div>
        <div className="goal-card-premium-bar-meta">
          <span className={`goal-card-premium-pct ${isComplete ? 'goal-card-premium-pct-done' : ''}`}>
            {Math.round(pct)}%{isComplete ? ' Complete' : ''}
          </span>
          {canAct && (
            <div className="goal-card-premium-actions">
              {onEdit && (
                <button
                  type="button"
                  className="goal-card-premium-btn goal-card-premium-btn-edit"
                  onClick={() => onEdit(goal)}
                  title="Edit goal"
                  aria-label="Edit goal"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="goal-card-premium-btn goal-card-premium-btn-delete"
                  onClick={() => onDelete(goal)}
                  title="Delete goal"
                  aria-label="Delete goal"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
