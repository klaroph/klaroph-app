'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'

type GoalPreview = {
  id: string
  name: string
  saved: number
  target: number
}

type GoalMomentumSectionProps = {
  totalGoals: number
  totalSaved: number
  totalTarget: number
  /** Up to 3 goals for a compact aspirational preview */
  previewGoals?: GoalPreview[]
}

export default function GoalMomentumSection({
  totalGoals,
  totalSaved,
  totalTarget,
  previewGoals = [],
}: GoalMomentumSectionProps) {
  const percent =
    totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0
  const previews = previewGoals.slice(0, 3)

  return (
    <section
      className="goal-momentum-executive goal-momentum-compact klaro-tint klaro-tone-mint"
      aria-labelledby="goal-momentum-heading"
    >
      <div className="goal-momentum-compact-header">
        <h2 id="goal-momentum-heading" className="goal-momentum-compact-title">
          Goal Momentum
        </h2>
        <Link href="/dashboard/goals" className="card-outline-link goal-momentum-compact-link">
          View all →
        </Link>
      </div>

      <div className="goal-momentum-compact-summary">
        <p className="goal-momentum-compact-saved tabular-nums">
          {formatCurrency(totalSaved)}
          <span className="goal-momentum-compact-saved-label"> saved</span>
        </p>
        <p className="goal-momentum-compact-meta">
          <span className="tabular-nums">{totalGoals}</span> active
          {totalTarget > 0 && (
            <>
              {' · '}
              <span className="tabular-nums">{Math.round(percent)}%</span> overall
            </>
          )}
        </p>
        {totalTarget > 0 && (
          <div
            className="goal-momentum-compact-overall"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall goal progress"
          >
            <div className="goal-momentum-compact-overall-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {previews.length > 0 ? (
        <ul className="goal-momentum-preview-list">
          {previews.map((g) => {
            const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0
            return (
              <li key={g.id} className="goal-momentum-preview-item">
                <div className="goal-momentum-preview-top">
                  <span className="goal-momentum-preview-name">{g.name}</span>
                  <span className="goal-momentum-preview-pct tabular-nums">{Math.round(pct)}%</span>
                </div>
                <div className="goal-momentum-preview-bar" aria-hidden>
                  <div className="goal-momentum-preview-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="goal-momentum-compact-empty">
          Set a goal to start building momentum.
        </p>
      )}
    </section>
  )
}
