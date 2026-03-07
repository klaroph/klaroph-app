'use client'

import { useState } from 'react'
import Link from 'next/link'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

export default function LegalUpdateForm() {
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/legal/accept', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Something went wrong.')
        setLoading(false)
        return
      }
      window.location.href = '/dashboard'
    } catch {
      setError('Something went wrong.')
      setLoading(false)
    }
  }

  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-logo">
          <KlaroPHHandLogo size={40} variant="onBlue" />
        </Link>
        <span className="legal-back" style={{ color: 'rgba(255,255,255,0.9)', cursor: 'default' }}>
          Legal update required
        </span>
      </header>

      <main className="legal-main">
        <h1 className="legal-title">Updated Terms &amp; Privacy Policy</h1>
        <p className="legal-updated">
          We&apos;ve updated our Terms &amp; Conditions and Privacy Policy. Please review and accept to continue using KlaroPH.
        </p>

        <section className="legal-section">
          <p style={{ marginBottom: 16 }}>
            You can read the full documents here:
          </p>
          <p style={{ margin: 0, marginBottom: 24 }}>
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="legal-link">
              Terms &amp; Conditions
            </Link>
            {' · '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="legal-link">
              Privacy Policy
            </Link>
          </p>

          <form onSubmit={handleSubmit}>
            <label className="login-terms-label" style={{ marginTop: 0 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="login-terms-checkbox"
                aria-describedby="legal-agree-desc"
              />
              <span id="legal-agree-desc">
                I agree to the updated Terms &amp; Conditions and Privacy Policy.
              </span>
            </label>

            {error && (
              <p role="alert" style={{ marginTop: 12, marginBottom: 0, color: 'var(--color-error)', fontSize: 14 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!agreed || loading}
              className="login-btn-primary"
              style={{ marginTop: 24, width: '100%', maxWidth: 320 }}
            >
              {loading ? 'Updating...' : 'Continue'}
            </button>
          </form>
        </section>

        <p className="legal-footer-note">
          <Link href="/" className="legal-link">Return to home</Link>
        </p>
      </main>
    </div>
  )
}
