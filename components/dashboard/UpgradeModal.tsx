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

const MONTHLY_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 149
const ANNUAL_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_ANNUAL_PESOS) || 1430

function formatPeso(n: number) {
  return `₱${Math.round(n).toLocaleString('en-PH')}`
}

function computePricing(original: number, promo: KlaroPromoVoucher | null) {
  if (!promo) {
    return { original, final: original, discountLabel: null as string | null }
  }
  if (promo.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, promo.value))
    const final = original * (1 - pct / 100)
    return { original, final, discountLabel: `-${pct}%` }
  }
  const off = Math.min(original, Math.max(0, promo.value))
  const final = original - off
  return { original, final, discountLabel: `-${formatPeso(off)}` }
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
  const { final: finalPrice, discountLabel } = computePricing(originalPrice, promo)

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
    <Modal isOpen={isOpen} onClose={handleClose} title="Upgrade to KlaroPH Pro" contentMaxWidth={520} closeOnOutsideClick={false}>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {message || 'Free plan includes analytics for the last 90 days. Upgrade to unlock unlimited history and advanced insights.'}
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

      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Have a promo code?
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <input
            type="text"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            placeholder="Enter code"
            autoComplete="off"
            disabled={isApplying}
            aria-label="Promo code"
            style={{
              flex: '1 1 160px',
              minWidth: 0,
              padding: '10px 12px',
              fontSize: 14,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            disabled={isApplying}
            className="btn-secondary"
            style={{
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              opacity: isApplying ? 0.65 : 1,
              cursor: isApplying ? 'not-allowed' : 'pointer',
            }}
          >
            {isApplying ? 'Applying…' : 'Apply'}
          </button>
        </div>
        {promo && (
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--color-primary)', fontWeight: 600 }}>
            {promo.type === 'percentage'
              ? `🎉 Promo applied! You got ${promo.value}% off`
              : `🎉 Promo applied! You got ${formatPeso(promo.value)} off`}
          </p>
        )}
        {error && !promo && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
        )}
        {urlApplyFailed && !promo && !error && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            The code from your link couldn&apos;t be applied. You can try another code above.
          </p>
        )}
      </div>

      {promo && (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--color-blue-muted)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Original Price:</span>
            <span style={{ fontWeight: 600 }}>{formatPeso(originalPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Discount:</span>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{discountLabel}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ fontWeight: 700 }}>Final Price:</span>
            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatPeso(finalPrice)}</span>
          </div>
        </div>
      )}

      {checkoutError && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{checkoutError}</p>
      )}

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
          {loading ? 'Redirecting to payment...' : 'Explore KlaroPH Pro'}
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

export default function UpgradeModal(props: UpgradeModalProps) {
  return (
    <Suspense fallback={null}>
      <UpgradeModalInner {...props} />
    </Suspense>
  )
}
