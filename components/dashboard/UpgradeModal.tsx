'use client'

import { useState } from 'react'
import Modal from '../ui/Modal'
import PlanFeaturePremiumIcon from '../ui/PlanFeaturePremiumIcon'
import {
  PLAN_SECTION_TOOLS_LABEL,
  PRO_PLAN_TOOLS,
} from '@/lib/planFeatures'

const MONTHLY_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 149
const ANNUAL_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_ANNUAL_PESOS) || 1430

type UpgradeModalProps = {
  isOpen: boolean
  onClose: () => void
  onUpgrade?: () => void
}

/** Table rows: strongest Pro differentiators first, then shared, then tools. Same wording as landing. */
function UpgradeTableRows() {
  return (
    <>
      {/* Pro differentiators first (conversion-focused) */}
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">
          <span className="plan-feature-premium">
            <PlanFeaturePremiumIcon />
            Unlimited History &amp; Insights
          </span>
        </td>
        <td className="upgrade-modal-free">—</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">
          <span className="plan-feature-premium">
            <PlanFeaturePremiumIcon />
            Monthly Budgeting
          </span>
        </td>
        <td className="upgrade-modal-free">First 30 days only</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">
          <span className="plan-feature-premium">
            <PlanFeaturePremiumIcon />
            Advanced Charts
          </span>
        </td>
        <td className="upgrade-modal-free">—</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">
          <span className="plan-feature-premium">
            <PlanFeaturePremiumIcon />
            Export CSV (Income and Expenses)
          </span>
        </td>
        <td className="upgrade-modal-free">—</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">20 Active Goals</td>
        <td className="upgrade-modal-free">2</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">Income Tracker</td>
        <td className="upgrade-modal-free">✓</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">Expense Tracker</td>
        <td className="upgrade-modal-free">✓</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row upgrade-modal-section-row">
        <td colSpan={3} className="upgrade-modal-section">
          {PLAN_SECTION_TOOLS_LABEL}
        </td>
      </tr>
      {PRO_PLAN_TOOLS.map(({ label, premium }) => (
        <tr key={label} className="upgrade-modal-row">
          <td className="upgrade-modal-feature">
            {premium ? (
              <span className="plan-feature-premium">
                <PlanFeaturePremiumIcon />
                {label}
              </span>
            ) : (
              label
            )}
          </td>
          <td className="upgrade-modal-free">{premium ? '—' : '✓'}</td>
          <td className="upgrade-modal-pro">✓</td>
        </tr>
      ))}
    </>
  )
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planType, setPlanType] = useState<'monthly' | 'annual'>('annual')

  const handleUpgrade = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/paymongo/create-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_type: planType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start checkout.')
        setLoading(false)
        return
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        setError('No checkout URL returned.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError(null)
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Upgrade to KlaroPH Pro" contentMaxWidth={520} closeOnOutsideClick={false}>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Free plan includes analytics for the last 90 days. Upgrade to unlock unlimited history and advanced insights.
      </p>

      <div className="upgrade-modal-table-wrap">
        <table className="upgrade-modal-table">
          <thead>
            <tr>
              <th className="upgrade-modal-th-feature">Feature</th>
              <th className="upgrade-modal-th-free">Free</th>
              <th className="upgrade-modal-th-pro">Pro</th>
            </tr>
          </thead>
          <tbody>
            <UpgradeTableRows />
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <label
          style={{
            flex: 1,
            padding: 16,
            border: `2px solid ${planType === 'monthly' ? 'var(--color-primary)' : 'var(--border)'}`,
            borderRadius: 12,
            background: planType === 'monthly' ? 'var(--color-blue-muted)' : 'var(--surface)',
            cursor: 'pointer',
          }}
        >
          <input type="radio" name="plan" checked={planType === 'monthly'} onChange={() => setPlanType('monthly')} style={{ marginRight: 8 }} />
          <strong>Monthly</strong>
          <div style={{ fontSize: 14, marginTop: 4 }}>₱{MONTHLY_PESOS} / month</div>
        </label>
        <label
          style={{
            flex: 1,
            padding: 16,
            border: `2px solid ${planType === 'annual' ? 'var(--color-primary)' : 'var(--border)'}`,
            borderRadius: 12,
            background: planType === 'annual' ? 'var(--color-blue-muted)' : 'var(--surface)',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-blue-muted)', padding: '2px 6px', borderRadius: 6 }}>Best Value</span>
          <input type="radio" name="plan" checked={planType === 'annual'} onChange={() => setPlanType('annual')} style={{ marginRight: 8 }} />
          <strong>Annual</strong>
          <div style={{ fontSize: 14, marginTop: 4 }}>₱{ANNUAL_PESOS} / year</div>
          <div style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, marginTop: 2 }}>Save 20%</div>
        </label>
      </div>

      {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleUpgrade}
          disabled={loading}
          style={{
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: loading ? 'var(--text-muted)' : 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Redirecting to payment...' : 'Upgrade to Pro'}
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={loading}
          style={{
            padding: '12px 20px',
            fontSize: 14,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            color: 'var(--text-secondary)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Maybe Later
        </button>
      </div>
    </Modal>
  )
}
