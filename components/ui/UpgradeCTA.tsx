'use client'

import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'

const lockIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

type UpgradeCTAProps = {
  /** Optional label; default "Upgrade to Pro" */
  label?: string
  /** Compact style for inline/banner use */
  variant?: 'default' | 'compact'
  className?: string
}

export default function UpgradeCTA({ label = 'Upgrade to Pro', variant = 'default', className = '' }: UpgradeCTAProps) {
  const trigger = useUpgradeTriggerOptional()
  const openModal = trigger?.openUpgradeModal

  if (!openModal) return null

  const isCompact = variant === 'compact'
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: isCompact ? '8px 14px' : '10px 18px',
    fontSize: isCompact ? 13 : 14,
    fontWeight: 600,
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s ease, transform 0.1s ease',
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => openModal()}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
      onMouseUp={(e) => e.currentTarget.style.transform = ''}
      onMouseLeave={(e) => e.currentTarget.style.transform = ''}
    >
      {lockIcon}
      {label}
    </button>
  )
}
