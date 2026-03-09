'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '../ui/Modal'

const MONTHLY_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 149
const POLL_INTERVAL_MS = 3500

type PaymentQRModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Call to refresh subscription state (e.g. from SubscriptionContext). */
  refreshSubscription: () => Promise<void>
  /** When true (after webhook), show success state. */
  isPro: boolean
}

type ViewState = 'loading' | 'qr' | 'expired' | 'success' | 'error'

export default function PaymentQRModal({
  isOpen,
  onClose,
  onSuccess,
  refreshSubscription,
  isPro,
}: PaymentQRModalProps) {
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [expiresAtEpoch, setExpiresAtEpoch] = useState<number>(0)
  const [countdownSecs, setCountdownSecs] = useState<number>(600)
  const [error, setError] = useState<string | null>(null)
  const [loadingNewQr, setLoadingNewQr] = useState(false)

  const fetchQr = useCallback(
    async (intentId?: string) => {
      const res = await fetch('/api/paymongo/create-qrph', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentId ? { payment_intent_id: intentId } : {}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load QR.')
        setViewState('error')
        return
      }
      setImageUrl(data.image_url)
      setPaymentIntentId(data.payment_intent_id)
      setExpiresAtEpoch(data.expires_at_epoch)
      setCountdownSecs(600)
      setError(null)
      setViewState('qr')
    },
    [],
  )

  useEffect(() => {
    if (!isOpen) return
    setViewState('loading')
    setError(null)
    setImageUrl(null)
    setPaymentIntentId(null)
    fetchQr()
  }, [isOpen, fetchQr])

  useEffect(() => {
    if (!isOpen || viewState !== 'qr' || expiresAtEpoch <= 0) return
    const tick = () => {
      const now = Math.floor(Date.now() / 1000)
      const remaining = Math.max(0, expiresAtEpoch - now)
      setCountdownSecs(remaining)
      if (remaining <= 0) setViewState('expired')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isOpen, viewState, expiresAtEpoch])

  useEffect(() => {
    if (!isOpen || viewState !== 'qr') return
    const id = setInterval(async () => {
      await refreshSubscription()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isOpen, viewState, refreshSubscription])

  useEffect(() => {
    if (isOpen && isPro && (viewState === 'qr' || viewState === 'loading')) {
      setViewState('success')
    }
  }, [isOpen, isPro, viewState])

  const handleContinue = () => {
    onSuccess?.()
    onClose()
  }

  const handleGenerateNewQr = async () => {
    if (!paymentIntentId) return
    setLoadingNewQr(true)
    setError(null)
    await fetchQr(paymentIntentId)
    setLoadingNewQr(false)
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const title =
    viewState === 'success'
      ? 'Payment received'
      : 'Complete your KlaroPH Pro upgrade'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      contentMaxWidth={420}
      closeOnOutsideClick={false}
    >
      <div style={{ padding: '8px 0 24px' }}>
        {viewState === 'success' && (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
              Payment received successfully ✅
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Your KlaroPH Pro access is now active.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Continue
            </button>
          </>
        )}

        {viewState === 'qr' && (
          <>
            <p style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
              ₱{MONTHLY_PESOS} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>/ month</span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Scan to pay"
                  width={220}
                  height={220}
                  style={{ display: 'block', borderRadius: 8 }}
                />
              )}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              Recipient currently appears as:<br />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>JERALD SIMAGALA</span>
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.45 }}>
              This payment is for KlaroPH Pro and is securely processed through PayMongo.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Scan using GCash, Maya, or banking app
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>
              QR expires in {formatCountdown(countdownSecs)}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Secure payment powered by PayMongo
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', opacity: 0.85 }}>
              More payment methods coming soon
            </p>
          </>
        )}

        {viewState === 'expired' && (
          <>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
              This QR code has expired. Generate a new one to continue.
            </p>
            <button
              type="button"
              onClick={handleGenerateNewQr}
              disabled={loadingNewQr}
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: loadingNewQr ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: loadingNewQr ? 0.7 : 1,
              }}
            >
              {loadingNewQr ? 'Generating...' : 'Generate New QR'}
            </button>
          </>
        )}

        {viewState === 'loading' && (
          <p style={{ margin: '24px 0', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Loading QR code...
          </p>
        )}

        {viewState === 'error' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-error)' }}>{error}</p>
            <button
              type="button"
              onClick={() => fetchQr()}
              style={{
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
