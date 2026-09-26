'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted) setSessionReady(!!session)
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionReady(!!session)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (err) {
      setError('This reset link is invalid or has expired.')
      return
    }
    setSuccess(true)
  }

  if (sessionReady === null) {
    return (
      <div className="reset-password-wrap">
        <div className="reset-password-card">
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="reset-password-wrap">
        <header className="reset-password-header">
          <Link href="/" className="reset-password-logo" aria-label="KlaroPH home">
            <KlaroPHHandLogo size={40} variant="onBlue" />
          </Link>
          <Link href="/#login" className="reset-password-back">← Back to sign in</Link>
        </header>
        <div className="reset-password-card">
          <h1 className="login-title">Create a new password</h1>
          <p className="login-subtitle">Enter a new password for your KlaroPH account.</p>
          <p role="alert" className="login-alert login-alert--error">This reset link is invalid or has expired.</p>
          <Link href="/#login" className="login-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="reset-password-wrap">
        <header className="reset-password-header">
          <Link href="/" className="reset-password-logo" aria-label="KlaroPH home">
            <KlaroPHHandLogo size={40} variant="onBlue" />
          </Link>
          <Link href="/#login" className="reset-password-back">← Back to sign in</Link>
        </header>
        <div className="reset-password-card">
          <h1 className="login-title">Create a new password</h1>
          <p role="status" className="login-alert login-alert--success">Your password has been updated successfully.</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="login-btn-primary"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="reset-password-wrap">
      <header className="reset-password-header">
        <Link href="/" className="reset-password-logo" aria-label="KlaroPH home">
          <KlaroPHHandLogo size={40} variant="onBlue" />
        </Link>
        <Link href="/#login" className="reset-password-back">← Back to sign in</Link>
      </header>
      <div className="reset-password-card">
        <h1 className="login-title">Create a new password</h1>
        <p className="login-subtitle">Enter a new password for your KlaroPH account.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div>
            <label htmlFor="reset-new-password" className="login-field-label">
              New password
            </label>
            <input
              id="reset-new-password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="login-input"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="reset-confirm-password" className="login-field-label">
              Confirm password
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="login-input"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>
          {error && (
            <p role="alert" className="login-alert login-alert--error">{error}</p>
          )}
          <button type="submit" disabled={loading} className="login-btn-primary">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
