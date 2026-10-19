'use client'

import { useState } from 'react'
import Modal from '../ui/Modal'
import PlanFeaturePremiumIcon from '../ui/PlanFeaturePremiumIcon'
import {
  PLAN_SECTION_TOOLS_LABEL,
  PRO_PLAN_TOOLS,
} from '@/lib/planFeatures'
import { PRO_ONE_TIME_LINE, PRO_ONE_TIME_PESOS, formatPlanPeso } from '@/lib/planPricing'
import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'
import { KLARO_AI_LIMITS } from '@/lib/ai/limits'

type UpgradeModalProps = {
  isOpen: boolean
  onClose: () => void
  onUpgrade?: () => void
  /** Optional context message (e.g. import quota exhausted). */
  message?: string
  /** Opens the QR Ph payment screen. */
  onOpenPaymentModal?: () => void
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
            Financial Health Insights
          </span>
        </td>
        <td className="upgrade-modal-free">Snap only – No Insight</td>
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
            Import CSV (Income and Expenses)
          </span>
        </td>
        <td className="upgrade-modal-free">Up to 2 imports only</td>
        <td className="upgrade-modal-pro">Unlimited</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">Ask Klaro (Beta) messages</td>
        <td className="upgrade-modal-free">{KLARO_AI_CHAT_LIMITS.FREE_DAILY_MESSAGES}/day</td>
        <td className="upgrade-modal-pro">{KLARO_AI_CHAT_LIMITS.PRO_DAILY_MESSAGES}/day</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">Klaro Insight</td>
        <td className="upgrade-modal-free">{KLARO_AI_LIMITS.FREE_DAILY_GENERATIONS}/day</td>
        <td className="upgrade-modal-pro">{KLARO_AI_LIMITS.PRO_DAILY_GENERATIONS}/day</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">20 Active Goals</td>
        <td className="upgrade-modal-free">2</td>
        <td className="upgrade-modal-pro">✓</td>
      </tr>
      <tr className="upgrade-modal-row">
        <td className="upgrade-modal-feature">Export CSV (Income and Expenses)</td>
        <td className="upgrade-modal-free">✓</td>
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
      {PRO_PLAN_TOOLS.length > 0 && (
      <tr className="upgrade-modal-row upgrade-modal-section-row">
        <td colSpan={3} className="upgrade-modal-section">
          {PLAN_SECTION_TOOLS_LABEL}
        </td>
      </tr>
      )}
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

function UpgradeModalInner({ isOpen, onClose, message, onOpenPaymentModal }: UpgradeModalProps) {
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const handleUpgrade = () => {
    if (!onOpenPaymentModal) {
      setCheckoutError('Payment is unavailable right now.')
      return
    }
    setCheckoutError(null)
    onOpenPaymentModal()
    onClose()
  }

  const handleClose = () => {
    setCheckoutError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Upgrade to KlaroPH Pro" contentMaxWidth={980} closeOnOutsideClick={false}>
      <div className="upgrade-modal-layout">
        <p className="upgrade-modal-lead">
          {message || 'Free includes the essentials for tracking your money. Pro adds unlimited history, full budgeting, and more room to ask Klaro.'}
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

        <div className="upgrade-modal-checkout">
          <p className="upgrade-modal-plan-price">{formatPlanPeso(PRO_ONE_TIME_PESOS)}</p>
          <p className="upgrade-modal-lead">{PRO_ONE_TIME_LINE}</p>

          {checkoutError && (
            <p className="upgrade-modal-checkout-error" role="alert">{checkoutError}</p>
          )}

          <div className="upgrade-modal-actions">
            <button
              type="button"
              onClick={handleUpgrade}
              className="klaro-upgrade-cta"
            >
              Choose Pro
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="btn-ghost"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function UpgradeModal(props: UpgradeModalProps) {
  return <UpgradeModalInner {...props} />
}
