'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'
import CardHeaderWithAction from '@/components/cards/CardHeaderWithAction'
import GoalMomentumDonut from './GoalMomentumDonut'

type GoalMomentumSectionProps = {
  totalGoals: number
  totalSaved: number
  totalTarget: number
}

function getEncouragement(percent: number): string {
  if (percent < 30) return "You're building momentum. Tuloy lang."
  if (percent < 70) return "You're halfway there. Stay consistent."
  return "Malapit na. You're almost there."
}

export default function GoalMomentumSection({
  totalGoals,
  totalSaved,
  totalTarget,
}: GoalMomentumSectionProps) {
  const percent =
    totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0
  const encouragement = getEncouragement(percent)


  return (
    <section
      className="goal-momentum-executive"
      aria-labelledby="goal-momentum-heading"
    >
      <CardHeaderWithAction
        title="Goal Momentum"
        titleAs="h2"
        titleId="goal-momentum-heading"
        actions={
          <Link href="/dashboard/goals" className="card-outline-link">
            Goals Page →
          </Link>
        }
      />
      <p className="goal-momentum-executive-encourage" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
        {encouragement}
      </p>
      <div className="goal-momentum-executive-body">
        <div className="goal-momentum-executive-stats">
          <div className="goal-momentum-executive-stat">
            <span className="goal-momentum-executive-label">Total Saved</span>
            <span className="goal-momentum-executive-value tabular-nums goal-momentum-value-success">
              {formatCurrency(totalSaved)}
            </span>
          </div>
          <div className="goal-momentum-executive-stat">
            <span className="goal-momentum-executive-label">Total Target</span>
            <span className="goal-momentum-executive-value tabular-nums">
              {formatCurrency(totalTarget)}
            </span>
          </div>
          <div className="goal-momentum-executive-stat">
            <span className="goal-momentum-executive-label">Active Goals</span>
            <span className="goal-momentum-executive-value tabular-nums">
              {totalGoals}
            </span>
          </div>
        </div>
        <div className="goal-momentum-executive-donut-ring">
          <GoalMomentumDonut percent={percent} ariaLabel={`${Math.round(percent)}% overall goal progress`} />
        </div>
      </div>
    </section>
  )
}
