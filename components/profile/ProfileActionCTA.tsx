'use client'

import Link from 'next/link'

type ProfileActionCTAProps = {
  isComplete: boolean
}

export default function ProfileActionCTA({ isComplete }: ProfileActionCTAProps) {
  if (isComplete) {
    return (
      <div
        style={{
          padding: 20,
          background: 'var(--color-success-muted)',
          borderRadius: 12,
          border: '1px solid var(--color-success)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--color-success)' }}>
          You&apos;re ready for smarter clarity.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 20,
        background: 'var(--color-blue-muted)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
        Complete your financial identity to unlock smarter insights.
      </p>
      <Link
        href="/dashboard/profile"
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 600,
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          borderRadius: 8,
          textDecoration: 'none',
          fontFamily: 'inherit',
        }}
      >
        Improve My Clarity
      </Link>
    </div>
  )
}
