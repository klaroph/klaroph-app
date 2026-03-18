'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseClient'

type ForgotPasswordModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSuccess(false)
    setEmail('')
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const redirectTo = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`
      : 'https://klaroph.com/reset-password'
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSuccess(true)
  }

  if (!isOpen) return null

  const content = (
    <div
      className="consent-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
      onClick={onClose}
    >
      <div className="consent-modal forgot-password-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="forgot-password-title" className="login-title">Reset your password</h2>
        <p className="login-subtitle">Enter your email and we&apos;ll send you a secure reset link.</p>

        {success ? (
          <p role="status" className="forgot-success-msg">
            If an account exists for this email, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="forgot-email" style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
                autoComplete="email"
                disabled={loading}
              />
            </div>
            {error && (
              <p role="alert" className="forgot-error-msg">{error}</p>
            )}
            <button type="submit" disabled={loading} className="login-btn-primary">
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <button type="button" onClick={onClose} className="login-btn-secondary" style={{ marginTop: 16 }}>
          {success ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
