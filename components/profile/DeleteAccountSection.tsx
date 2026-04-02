'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { signOutWithFullCleanup } from '@/lib/supabaseAuthSignOut'
import Modal from '@/components/ui/Modal'

const WARNING =
  'Deleting your account permanently removes your profile, expenses, income, budgets, goals, and subscription data.'

export default function DeleteAccountSection() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
  }, [open])

  const handleOpen = () => {
    setStep(1)
    setEmailInput('')
    setError(null)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setStep(1)
    setEmailInput('')
    setError(null)
  }

  const emailMatches = userEmail != null && emailInput.trim() === userEmail

  const handleDelete = async () => {
    if (!emailMatches) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data?.error as string) || 'Something went wrong.')
        setLoading(false)
        return
      }
      await signOutWithFullCleanup()
      router.replace('/')
      return
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <>
      <div
        className="premium-card"
        style={{
          marginBottom: 20,
          borderColor: 'var(--color-danger, #dc2626)',
          borderWidth: 1,
          borderStyle: 'solid',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--color-danger, #dc2626)' }}>
          Delete account
        </h4>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
          Permanently remove your account and all associated data. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleOpen}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            backgroundColor: 'transparent',
            color: 'var(--color-danger, #dc2626)',
            border: '1px solid var(--color-danger, #dc2626)',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Delete account
        </button>
      </div>

      <Modal
        isOpen={open}
        onClose={handleClose}
        title={step === 1 ? 'Delete your account?' : 'Confirm with your email'}
        closeOnOutsideClick={!loading}
        contentMaxWidth={440}
      >
        {step === 1 ? (
          <>
            <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.5, color: 'var(--text-primary)' }}>
              {WARNING}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: 'var(--color-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: 'var(--color-danger, #dc2626)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Yes, I understand the risk, please proceed
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Type your account email to confirm:
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                marginBottom: 16,
              }}
            />
            {error && (
              <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-error, #dc2626)' }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setStep(1); setError(null); setEmailInput(''); }}
                disabled={loading}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: 'var(--color-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!emailMatches || loading}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: emailMatches && !loading ? 'var(--color-danger, #dc2626)' : 'var(--text-muted)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: emailMatches && !loading ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? 'Deleting…' : 'Delete my account permanently'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
