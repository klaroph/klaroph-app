'use client'

import { formatCurrency } from '@/lib/format'
import GoalMomentumDonut from '@/components/dashboard/GoalMomentumDonut'

export type GoalMomentumSummary = {
  totalSaved: number
  totalTarget: number
  activeGoals: number
  overallPercent: number
}

export type StrongestGoalInsight = {
  name: string
  percent: number
} | null

type GoalMomentumHeroProps = GoalMomentumSummary & {
  strongestGoal?: StrongestGoalInsight
}

function getEncouragement(percent: number): string {
  if (percent < 30) return "You're building momentum. Every peso counts."
  if (percent < 70) return "You're halfway there. Stay consistent."
  return "Almost there. Keep going."
}

export default function GoalMomentumHero({
  totalSaved,
  totalTarget,
  activeGoals,
  overallPercent,
  strongestGoal,
}: GoalMomentumHeroProps) {
  const encouragement = getEncouragement(overallPercent)

  return (
    <section
      className="goal-momentum-hero"
      aria-labelledby="goal-momentum-hero-heading"
    >
      <div className="goal-momentum-hero-inner">
        <header className="goal-momentum-hero-header">
          <h2 id="goal-momentum-hero-heading" className="goal-momentum-hero-title">
            Goal Momentum
          </h2>
          <p className="goal-momentum-hero-encourage">{encouragement}</p>
        </header>

        <div className="goal-momentum-hero-body">
          <div className="goal-momentum-hero-donut">
            <div className="goal-momentum-hero-donut-ring">
              <GoalMomentumDonut
                percent={overallPercent}
                ariaLabel={`${Math.round(overallPercent)}% overall goal progress`}
              />
            </div>
          </div>

          <div className="goal-momentum-hero-stats">
            <div className="goal-momentum-hero-stat">
              <span className="goal-momentum-hero-label">Total saved</span>
              <span className="goal-momentum-hero-value goal-momentum-hero-value-accent tabular-nums">
                {formatCurrency(totalSaved)}
              </span>
            </div>
            <div className="goal-momentum-hero-stat">
              <span className="goal-momentum-hero-label">Total target</span>
              <span className="goal-momentum-hero-value tabular-nums">
                {formatCurrency(totalTarget)}
              </span>
            </div>
            <div className="goal-momentum-hero-stat">
              <span className="goal-momentum-hero-label">Active goals</span>
              <span className="goal-momentum-hero-value tabular-nums">
                {activeGoals}
              </span>
            </div>
            {strongestGoal && strongestGoal.percent < 100 && (
              <div className="goal-momentum-hero-insight">
                <span className="goal-momentum-hero-insight-label">
                  Closest to target
                </span>
                <span className="goal-momentum-hero-insight-value">
                  {strongestGoal.name} — {Math.round(strongestGoal.percent)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
