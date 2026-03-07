'use client'

import { CLARITY_LEVELS } from '@/types/profile'

type ClarityBadgeProps = {
  level: number
  showTagline?: boolean
  size?: 'sm' | 'md'
}

export default function ClarityBadge({
  level,
  showTagline = true,
  size = 'md',
}: ClarityBadgeProps) {
  const info = CLARITY_LEVELS[level] ?? CLARITY_LEVELS[1]
  const isSm = size === 'sm'

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
      }}
    >
      <span
        style={{
          padding: isSm ? '4px 10px' : '6px 14px',
          fontSize: isSm ? 12 : 14,
          fontWeight: 600,
          color: 'var(--color-primary)',
          backgroundColor: 'var(--color-blue-muted)',
          borderRadius: 20,
          border: '1px solid var(--color-primary)',
        }}
      >
        Level {level} – {info.label}
      </span>
      {showTagline && (
        <span
          style={{
            fontSize: isSm ? 12 : 14,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }}
        >
          {info.tagline}
        </span>
      )}
    </div>
  )
}
