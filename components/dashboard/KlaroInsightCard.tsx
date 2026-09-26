'use client'

/**
 * Klaro Insight — deterministic stack + optional AI narrative from /api/ai/insight.
 * Never claims to be AI-generated unless source is gemini/cache from the API.
 */

import Link from 'next/link'
import type { DerivedDashboardInsightStack, InsightItem } from '@/lib/dashboardInsight'

type AiInsightState = {
  text: string
  source: 'gemini' | 'fallback' | 'cache'
  loading?: boolean
}

type KlaroInsightCardProps = {
  stack: DerivedDashboardInsightStack
  aiInsight?: AiInsightState | null
  onRefreshAi?: () => void
  className?: string
}

export default function KlaroInsightCard({
  stack,
  aiInsight = null,
  onRefreshAi,
  className = '',
}: KlaroInsightCardProps) {
  const { title, variant, source, items } = stack
  const primary = items[0]
  const secondary = items.slice(1)
  const narrative = aiInsight?.text?.trim() || null
  const showAiLoading = Boolean(aiInsight?.loading)

  return (
    <aside
      className={`klaro-insight-card klaro-insight-card--${variant} klaro-insight-card--stacked ${className}`.trim()}
      aria-label={title}
      aria-busy={showAiLoading}
    >
      <div className="klaro-insight-header">
        <div className="klaro-insight-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
          </svg>
        </div>
        <p className="klaro-insight-title">{title}</p>
        {onRefreshAi && (
          <button
            type="button"
            className="klaro-insight-refresh"
            onClick={onRefreshAi}
            disabled={showAiLoading}
            aria-label="Refresh Klaro insight"
          >
            Refresh
          </button>
        )}
      </div>

      <ul className="klaro-insight-stack">
        <li className="klaro-insight-item klaro-insight-item--primary">
          {showAiLoading && !narrative ? (
            <p className="klaro-insight-text klaro-insight-text--loading">Preparing your insight…</p>
          ) : (
            <p className="klaro-insight-text">
              {narrative ?? primary?.body ?? 'Keep tracking to unlock clearer insights.'}
            </p>
          )}
          {primary && (
            <Link href={primary.href} className="klaro-insight-action">
              {primary.actionLabel}
            </Link>
          )}
        </li>
        {secondary.map((item: InsightItem) => (
          <li key={item.id} className="klaro-insight-item klaro-insight-item--secondary">
            <p className="klaro-insight-text">{item.body}</p>
            <Link href={item.href} className="klaro-insight-action klaro-insight-action--quiet">
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>

      {(source === 'calculated' || narrative) && (
        <p className="klaro-insight-source">
          {aiInsight?.source === 'gemini' || aiInsight?.source === 'cache'
            ? 'Klaro Insight · based on your KlaroPH numbers'
            : 'Based on your KlaroPH numbers'}
        </p>
      )}
    </aside>
  )
}
