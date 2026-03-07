'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabasePublic } from '@/lib/supabasePublicClient'

const MIN_PASSWORD_LENGTH = 8

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

type SignUpModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function SignUpModal({ isOpen, onClose }: SignUpModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const emailValid = email.trim() !== '' && isValidEmail(email)
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = password !== '' && password === confirmPassword
  const formValid = emailValid && passwordValid && passwordsMatch && termsChecked

  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [termsError, setTermsError] = useState<string | null>(null)

  const validateEmail = useCallback(() => {
    if (email.trim() === '') {
      setEmailError('Email is required.')
      return
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError(null)
  }, [email])

  const validatePassword = useCallback(() => {
    if (password.length === 0) {
      setPasswordError(null)
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setPasswordError(null)
  }, [password])

  const validateConfirm = useCallback(() => {
    if (confirmPassword.length === 0) {
      setConfirmError(null)
      return
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.')
      return
    }
    setConfirmError(null)
  }, [password, confirmPassword])

  const validateTerms = useCallback(() => {
    if (!termsChecked) setTermsError('You must agree to the Terms and Privacy Policy.')
    else setTermsError(null)
  }, [termsChecked])

  useEffect(() => {
    if (!isOpen) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    validateEmail()
    validatePassword()
    validateConfirm()
    validateTerms()

    if (!emailValid || !passwordValid || !passwordsMatch || !termsChecked) {
      if (!termsChecked) setTermsError('You must agree to the Terms and Privacy Policy.')
      return
    }

    setLoading(true)
    const redirectUrl =
      typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
        : undefined

    console.log('RAW EMAIL VALUE:', email)
    console.log('CHAR CODES:', email.split('').map(c => c.charCodeAt(0)))

    const { data, error } = await supabasePublic.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectUrl },
    })

    console.log('SIGNUP RESPONSE:', data, error)

    setLoading(false)
    if (error) {
      setSubmitError(error.message)
      return
    }
    if (data?.user) {
      setSuccess(true)
    }
  }

  const handleClose = () => {
    if (success) {
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setTermsChecked(false)
      setSuccess(false)
      setSubmitError(null)
      setEmailError(null)
      setPasswordError(null)
      setConfirmError(null)
      setTermsError(null)
    }
    onClose()
  }

  if (!isOpen) return null

  const content = success ? (
    <div className="signup-success">
      <h3 className="signup-success-title">Check your email</h3>
      <p className="signup-success-message">
        We&apos;ve sent a confirmation link to your email address. Please verify your account before signing in.
      </p>
      <button type="button" onClick={handleClose} className="login-btn-primary">
        Close
      </button>
    </div>
  ) : (
    <>
      <h3 id="signup-modal-title" className="signup-modal-heading">Create Free Account</h3>
      <form onSubmit={handleSubmit} className="signup-form" noValidate>
        <div className="signup-field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); setSubmitError(null) }}
            onBlur={validateEmail}
            placeholder="you@example.com"
            className="login-input"
            autoComplete="email"
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'signup-email-err' : undefined}
          />
          {emailError && (
            <p id="signup-email-err" role="alert" className="signup-field-error">{emailError}</p>
          )}
        </div>
        <div className="signup-field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(null); setSubmitError(null) }}
            onBlur={validatePassword}
            placeholder="••••••••"
            className="login-input"
            autoComplete="new-password"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? 'signup-password-err' : undefined}
          />
          {passwordError && (
            <p id="signup-password-err" role="alert" className="signup-field-error">{passwordError}</p>
          )}
        </div>
        <div className="signup-field">
          <label htmlFor="signup-confirm">Confirm Password</label>
          <input
            id="signup-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(null); setSubmitError(null) }}
            onBlur={validateConfirm}
            placeholder="••••••••"
            className="login-input"
            autoComplete="new-password"
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? 'signup-confirm-err' : undefined}
          />
          {confirmError && (
            <p id="signup-confirm-err" role="alert" className="signup-field-error">{confirmError}</p>
          )}
        </div>
        <label className="login-terms-label signup-terms">
          <input
            type="checkbox"
            checked={termsChecked}
            onChange={(e) => { setTermsChecked(e.target.checked); setTermsError(null); setSubmitError(null) }}
            onBlur={validateTerms}
            className="login-terms-checkbox"
            aria-describedby="signup-terms-desc signup-terms-err"
            aria-invalid={!!termsError}
          />
          <span id="signup-terms-desc">
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="login-terms-link">Terms &amp; Conditions</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="login-terms-link">Privacy Policy</a>
          </span>
        </label>
        {termsError && (
          <p id="signup-terms-err" role="alert" className="signup-field-error">{termsError}</p>
        )}
        {submitError && (
          <p role="alert" className="signup-submit-error">{submitError}</p>
        )}
        <button
          type="submit"
          disabled={!formValid || loading}
          className="login-btn-primary"
        >
          {loading ? 'Creating account...' : 'Create Free Account'}
        </button>
      </form>
    </>
  )

  const modal = (
    <div
      className="consent-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={success ? undefined : 'signup-modal-title'}
      onClick={handleClose}
    >
      <div className="consent-modal signup-modal" onClick={(e) => e.stopPropagation()}>
        {!success && (
          <button
            type="button"
            onClick={handleClose}
            className="signup-modal-close"
            aria-label="Close"
          >
            ×
          </button>
        )}
        {content}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
