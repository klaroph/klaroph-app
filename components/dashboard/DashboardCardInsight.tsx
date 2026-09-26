import type { CardInsight } from '@/lib/dashboardCardInsights'

/** Shared dashboard card insight line — green when positive, red when negative. */
export default function DashboardCardInsight({ insight }: { insight: CardInsight }) {
  return (
    <p className={`dash-card-insight dash-card-insight--${insight.tone}`} role="status">
      {insight.message}
    </p>
  )
}
