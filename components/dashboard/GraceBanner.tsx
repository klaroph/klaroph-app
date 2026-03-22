'use client'

import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'

const graceBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  flexWrap: 'wrap',
  padding: '14px 20px',
  margin: '0 12px 12px',
  borderRadius: 12,
  border: '1px solid var(--color-warning-border, rgba(245, 158, 11, 0.35))',
  backgroundColor: 'var(--color-warning-muted, #fffbeb)',
  color: 'var(--color-warning-text, #92400e)',
  fontSize: 14,
  lineHeight: 1.45,
  textAlign: 'center',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
}

const expiredBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  flexWrap: 'wrap',
  padding: '14px 20px',
  margin: '0 12px 12px',
  borderRadius: 12,
  border: '1px solid var(--color-blue-border, rgba(59, 130, 246, 0.35))',
  backgroundColor: 'var(--color-blue-muted, #eff6ff)',
  color: 'var(--color-blue-text, #1e40af)',
  fontSize: 14,
  lineHeight: 1.45,
  textAlign: 'center',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
}

const ctaButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}

const graceCtaStyle: React.CSSProperties = {
  ...ctaButtonStyle,
  backgroundColor: 'var(--color-warning, #d97706)',
  color: '#fff',
}

const expiredCtaStyle: React.CSSProperties = {
  ...ctaButtonStyle,
  backgroundColor: 'var(--color-primary, #2563eb)',
  color: '#fff',
}

function WarningIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function PremiumIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export default function GraceBanner() {
  const { subscriptionStatus, is_grace, isPro } = useSubscription()
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  if (subscriptionStatus === 'past_due' && is_grace) {
    return (
      <div role="alert" className="grace-banner grace-banner--grace" style={graceBannerStyle}>
        <WarningIcon />
        <span>
          Payment issue detected. Your Pro access continues for 3 days while you update billing.
        </span>
        {openUpgrade && (
          <button
            type="button"
            onClick={() => openUpgrade()}
            style={graceCtaStyle}
            className="grace-banner-cta"
          >
            Update Billing
          </button>
        )}
      </div>
    )
  }

  if (subscriptionStatus === 'expired' && !isPro) {
    return (
      <div
        role="alert"
        className="grace-banner grace-banner--expired max-lg:!hidden"
        style={expiredBannerStyle}
      >
        <PremiumIcon />
        <span>
          Pro features are paused. Upgrade anytime to restore unlimited access.
        </span>
        {openUpgrade && (
          <button
            type="button"
            onClick={() => openUpgrade()}
            style={expiredCtaStyle}
            className="grace-banner-cta"
          >
            Explore KlaroPH Pro
          </button>
        )}
      </div>
    )
  }

  return null
}
