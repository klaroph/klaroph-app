'use client'

/**
 * Subtle premium indicator for plan comparison (landing + upgrade modal).
 * Fintech-grade star icon — use next to Pro-only features.
 */
export default function PlanFeaturePremiumIcon() {
  return (
    <span className="plan-feature-premium-icon" aria-hidden title="Pro">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
      </svg>
    </span>
  )
}
