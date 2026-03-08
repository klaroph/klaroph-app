'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchUserFeatures } from '@/lib/features'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { supabase } from '@/lib/supabaseClient'

export default function UpgradeSuccessPage() {
  const router = useRouter()
  const { refresh } = useSubscription()
  const [checking, setChecking] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let attempts = 0
    const maxAttempts = 10

    const poll = async () => {
      const features = await fetchUserFeatures()
      if (features?.plan_name === 'pro' || features?.plan_name === 'clarity_premium') {
        setConfirmed(true)
        setChecking(false)
        try {
          await supabase.auth.refreshSession()
          await refresh()
        } catch (_) {
          // still redirect with fresh features from poll
        }
        router.replace('/dashboard')
        return
      }
      attempts++
      if (attempts >= maxAttempts) {
        setChecking(false)
        return
      }
      setTimeout(poll, 2000)
    }

    poll()
  }, [router, refresh])

  const handleContinue = async () => {
    await refresh()
    router.replace('/dashboard')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 32,
        textAlign: 'center',
      }}
    >
      {checking ? (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              border: '4px solid var(--border)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: 24,
            }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
            Confirming your payment...
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            This usually takes a few seconds.
          </p>
        </>
      ) : confirmed ? (
        <>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
            Welcome to KlaroPH Pro!
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 24px', maxWidth: 400 }}>
            You now have full access: 20 goals, unlimited history, export, advance charts and analytics.
          </p>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              padding: '14px 32px',
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
            Go to Dashboard
          </button>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
            Payment received
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: 400 }}>
            Your payment was successful. It may take a moment for your plan to update.
            If your plan hasn&apos;t changed in a few minutes, please contact support.
          </p>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              padding: '14px 32px',
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
            Go to Dashboard
          </button>
        </>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
