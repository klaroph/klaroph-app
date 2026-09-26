'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Modal from '../ui/Modal'
import PlanFeaturePremiumIcon from '../ui/PlanFeaturePremiumIcon'
import {
  PLAN_SECTION_TOOLS_LABEL,
  PRO_PLAN_TOOLS,
} from '@/lib/planFeatures'
import {
  clearKlaroPromo,
  readKlaroPromo,
  writeKlaroPromo,
  type KlaroPromoVoucher,
} from '@/lib/klaroPromoStorage'
import { FOUNDER_FINAL_CENTAVOS, FOUNDER_PROMO_CODE } from '@/lib/checkoutPromo'
import {
  PRO_ANNUAL_PESOS as ANNUAL_PESOS,
  PRO_MONTHLY_PESOS as MONTHLY_PESOS,
  formatPlanPeso as formatPeso,
} from '@/lib/planPricing'
import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'
import { KLARO_AI_LIMITS } from '@/lib/ai/limits'

function formatExpiryDate(planType: 'monthly' | 'annual') {
  const d = new Date()
  if (planType === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function computePricing(
  original: number,
  promo: KlaroPromoVoucher | null,
  promoCode: string | null
) {
  const normalizedCode = (promoCode ?? '').trim().toUpperCase()
  if (normalizedCode === FOUNDER_PROMO_CODE) {
    const final = Math.round(FOUNDER_FINAL_CENTAVOS / 100)
    return {
      original,
      final,
      discountLabel: null as string | null,
      specialLabel: 'Founder price',
    }
  }
  if (!promo) {
    return {
      original,
      final: original,
      discountLabel: null as string | null,
      specialLabel: null as string | null,
    }
  }
  if (promo.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, promo.value))
    const final = original * (1 - pct / 100)
    return { original, final, discountLabel: `-${pct}%`, specialLabel: null as string | null }
  }
  const off = Math.min(original, Math.max(0, promo.value))
  const final = original - off
  return { original, final, discountLabel: formatPeso(-off), specialLabel: null as string | null }
}

type UpgradeModalProps = {
  isOpen: boolean
  onClose: () => void
  onUpgrade?: () => void
  /** Optional context message (e.g. import quota exhausted). */
  message?: string
  /** When provided, both Monthly and Annual use QRPH modal; called with selected planType. */
  onOpenPaymentModal?: (planType: 'monthly' | 'annual', promo: KlaroPromoVoucher | null) => void
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
            Export CSV (Income and Expenses)
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

function UpgradeModalInner({ isOpen, onClose, message, onOpenPaymentModal }: UpgradeModalProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [planType, setPlanType] = useState<'monthly' | 'annual'>('annual')

  const [promoInput, setPromoInput] = useState('')
  /** Normalized code after successful redeem; sent to checkout APIs (not trusted for amount). */
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [promo, setPromo] = useState<KlaroPromoVoucher | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlApplyFailed, setUrlApplyFailed] = useState(false)
  const hasAutoApplied = useRef(false)
  const lastModalOpen = useRef(false)

  const applyPromoWithCode = useCallback(
    async (rawCode: string, opts?: { fromUrl?: boolean }): Promise<boolean> => {
      const code = rawCode.trim().toUpperCase()
      setPromoInput(code)

      if (!code) {
        if (opts?.fromUrl) setUrlApplyFailed(true)
        else {
          setError('Invalid or expired code')
          setPromo(null)
          setAppliedPromoCode(null)
          clearKlaroPromo()
        }
        return false
      }

      setError(null)
      setUrlApplyFailed(false)
      setIsApplying(true)
      try {
        const res = await fetch('/api/vouchers/validate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (opts?.fromUrl) setUrlApplyFailed(true)
          else setError('Invalid or expired code')
          setPromo(null)
          setAppliedPromoCode(null)
          clearKlaroPromo()
          return false
        }
        if (data?.success && data?.voucher?.type && typeof data.voucher?.value === 'number') {
          const v = data.voucher as { type: 'percentage' | 'fixed'; value: number }
          const applied = { type: v.type, value: v.value }
          setPromo(applied)
          setAppliedPromoCode(code)
          writeKlaroPromo({ promoCode: code, promo: applied })
          setError(null)
          setUrlApplyFailed(false)
          if (opts?.fromUrl && pathname) {
            router.replace(pathname, { scroll: false })
          }
          return true
        }
        if (opts?.fromUrl) setUrlApplyFailed(true)
        else setError('Invalid or expired code')
        setPromo(null)
        setAppliedPromoCode(null)
        clearKlaroPromo()
        return false
      } catch {
        if (opts?.fromUrl) setUrlApplyFailed(true)
        else setError('Invalid or expired code')
        setPromo(null)
        setAppliedPromoCode(null)
        clearKlaroPromo()
        return false
      } finally {
        setIsApplying(false)
      }
    },
    [pathname, router]
  )

  useEffect(() => {
    if (!isOpen) {
      hasAutoApplied.current = false
      lastModalOpen.current = false
      setPromoInput('')
      setAppliedPromoCode(null)
      setPromo(null)
      setError(null)
      setUrlApplyFailed(false)
      setIsApplying(false)
      setCheckoutError(null)
      return
    }
    const stored = readKlaroPromo()
    if (stored) {
      setPromoInput(stored.promoCode)
      if (stored.promo) {
        setPromo(stored.promo)
        setAppliedPromoCode(stored.promoCode)
      } else {
        setPromo(null)
        setAppliedPromoCode(null)
      }
    }
  }, [isOpen])

  /** Redeem pre-saved landing code once when modal transitions closed → open (logged-in session). */
  useEffect(() => {
    if (!isOpen) {
      lastModalOpen.current = false
      return
    }
    const justOpened = !lastModalOpen.current
    lastModalOpen.current = true
    if (!justOpened) return
    const stored = readKlaroPromo()
    if (!stored?.promoCode || stored.promo) return
    void applyPromoWithCode(stored.promoCode, { fromUrl: false })
  }, [isOpen, applyPromoWithCode])

  useEffect(() => {
    if (!isOpen || hasAutoApplied.current) return
    const urlCode = searchParams.get('code')?.trim().toUpperCase() ?? ''
    if (!urlCode) return
    if (readKlaroPromo()) {
      hasAutoApplied.current = true
      return
    }

    hasAutoApplied.current = true
    setPromoInput(urlCode)
    void applyPromoWithCode(urlCode, { fromUrl: true })
  }, [isOpen, searchParams, applyPromoWithCode])

  const originalPrice = planType === 'monthly' ? MONTHLY_PESOS : ANNUAL_PESOS
  const { final: finalPrice, discountLabel, specialLabel } = computePricing(
    originalPrice,
    promo,
    appliedPromoCode
  )
  const isFounderLifetime = appliedPromoCode?.toUpperCase() === FOUNDER_PROMO_CODE
  const expiryText = isFounderLifetime
    ? 'No expiry (Lifetime Access)'
    : formatExpiryDate(planType)

  const handleApplyPromo = () => {
    void applyPromoWithCode(promoInput, { fromUrl: false })
  }

  const handleUpgrade = async () => {
    const bundle = readKlaroPromo()
    const effectiveCode = appliedPromoCode ?? bundle?.promoCode ?? null
    if (promo && effectiveCode) {
      writeKlaroPromo({ promoCode: effectiveCode, promo })
    }

    if (onOpenPaymentModal) {
      onOpenPaymentModal(planType, promo)
      onClose()
      return
    }
    setLoading(true)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          promoCode: effectiveCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCheckoutError(data.error ?? 'Failed to start checkout.')
        setLoading(false)
        return
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        setCheckoutError('No checkout URL returned.')
        setLoading(false)
      }
    } catch {
      setCheckoutError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setCheckoutError(null)
      onClose()
    }
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
          <fieldset className="upgrade-modal-plans">
            <legend className="sr-only">Billing period</legend>
            <label className={`upgrade-modal-plan${planType === 'monthly' ? ' is-selected' : ''}`}>
              <input type="radio" name="plan" checked={planType === 'monthly'} onChange={() => setPlanType('monthly')} />
              <span className="upgrade-modal-plan-name">Monthly</span>
              <span className="upgrade-modal-plan-price">{formatPeso(MONTHLY_PESOS)} / month</span>
            </label>
            <label className={`upgrade-modal-plan${planType === 'annual' ? ' is-selected' : ''}`}>
              <input type="radio" name="plan" checked={planType === 'annual'} onChange={() => setPlanType('annual')} />
              <span className="upgrade-modal-plan-badge">Best value</span>
              <span className="upgrade-modal-plan-name">Annual</span>
              <span className="upgrade-modal-plan-price">{formatPeso(ANNUAL_PESOS)} / year</span>
            </label>
          </fieldset>
          <p className="upgrade-modal-expiry">
            Access until: <strong>{expiryText}</strong>
          </p>

          <div className="upgrade-modal-promo">
            <label htmlFor="upgrade-promo-code" className="upgrade-modal-promo-label">
              Have a promo code?
            </label>
            <div className="upgrade-modal-promo-row">
              <input
                id="upgrade-promo-code"
                type="text"
                className="upgrade-modal-promo-input"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Enter code"
                autoComplete="off"
                disabled={isApplying}
              />
              <button
                type="button"
                onClick={handleApplyPromo}
                disabled={isApplying}
                className="btn-secondary"
              >
                {isApplying ? 'Applying…' : 'Apply'}
              </button>
            </div>
            {promo && (
              <p className="upgrade-modal-promo-ok" role="status">
                {appliedPromoCode?.toUpperCase() === FOUNDER_PROMO_CODE
                  ? `🎉 Founder promo applied! Final price is ${formatPeso(FOUNDER_FINAL_CENTAVOS / 100)}`
                  : promo.type === 'percentage'
                  ? `🎉 Promo applied! You got ${promo.value}% off`
                  : `🎉 Promo applied! You got ${formatPeso(promo.value)} off`}
              </p>
            )}
            {error && !promo && (
              <p className="upgrade-modal-promo-error" role="alert">{error}</p>
            )}
            {urlApplyFailed && !promo && !error && (
              <p className="upgrade-modal-promo-hint">
                The code from your link couldn&apos;t be applied. You can try another code above.
              </p>
            )}
          </div>

          {promo && (
            <dl className="upgrade-modal-summary">
              {!isFounderLifetime && (
                <div>
                  <dt>Original price</dt>
                  <dd>{formatPeso(originalPrice)}</dd>
                </div>
              )}
              {discountLabel && (
                <div>
                  <dt>Discount</dt>
                  <dd className="is-accent">{discountLabel}</dd>
                </div>
              )}
              {specialLabel && (
                <div>
                  <dt>Offer</dt>
                  <dd className="is-accent">{specialLabel}</dd>
                </div>
              )}
              <div className="upgrade-modal-summary-total">
                <dt>Final price</dt>
                <dd>{formatPeso(finalPrice)}</dd>
              </div>
            </dl>
          )}

          {checkoutError && (
            <p className="upgrade-modal-checkout-error" role="alert">{checkoutError}</p>
          )}

          <div className="upgrade-modal-actions">
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={loading}
              className="klaro-upgrade-cta"
            >
              {loading ? 'Redirecting to payment…' : 'Choose Pro'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
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
  return (
    <Suspense fallback={null}>
      <UpgradeModalInner {...props} />
    </Suspense>
  )
}
