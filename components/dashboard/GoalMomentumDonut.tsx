'use client'

/**
 * Executive donut chart: progress ring with centered percentage.
 * Uses design tokens; size controlled via CSS (.goal-momentum-donut-wrap).
 */
const VIEWBOX_SIZE = 200
const CENTER = VIEWBOX_SIZE / 2
const RADIUS = 82
const STROKE_WIDTH = 16
const circumference = 2 * Math.PI * RADIUS

type GoalMomentumDonutProps = {
  percent: number
  /** Accessible label for the chart */
  ariaLabel?: string
}

export default function GoalMomentumDonut({
  percent,
  ariaLabel = 'Overall goal progress',
}: GoalMomentumDonutProps) {
  const clamped = Math.min(100, Math.max(0, percent))
  const strokeDashoffset = circumference - (clamped / 100) * circumference

  return (
    <div className="goal-momentum-donut-wrap" role="img" aria-label={ariaLabel}>
      <svg
        className="goal-momentum-donut-svg"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        aria-hidden
      >
        {/* Track */}
        <circle
          className="goal-momentum-donut-track"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Progress */}
        <circle
          className="goal-momentum-donut-fill"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </svg>
      <div className="goal-momentum-donut-center">
        <span className="goal-momentum-donut-pct tabular-nums">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  )
}
