'use client'

import { useState } from 'react'

type PremiumBadgeProps = {
  /** Optional: trigger shimmer on first paint */
  shimmer?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export default function PremiumBadge({
  shimmer = false,
  size = 'md',
  className = '',
}: PremiumBadgeProps) {
  const [shimmerDone, setShimmerDone] = useState(false)

  return (
    <span
      className={`premium-badge premium-badge-${size} ${shimmer && !shimmerDone ? 'premium-badge-shimmer' : ''} ${className}`}
      onAnimationEnd={() => shimmer && setShimmerDone(true)}
      role="status"
      aria-label="Pro plan"
    >
      <span className="premium-badge-icon" aria-hidden>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
        </svg>
      </span>
      <span className="premium-badge-text">PRO</span>
    </span>
  )
}
