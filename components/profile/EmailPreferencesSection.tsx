'use client'

import { useEffect, useState } from 'react'

type CardProps = {
  productUpdates: boolean
  saving: boolean
  error: string | null
  onToggle: () => void
}

export function EmailPreferencesCard({ productUpdates, saving, error, onToggle }: CardProps) {
  return (
    <div className="premium-card" style={{ marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Email preferences</h4>
      <div className="email-pref-row">
        <div style={{ minWidth: 0 }}>
          <p id="email-pref-product-updates" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            Product updates
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
            Get occasional updates about new KlaroPH features, improvements, and useful resources.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }} aria-live="polite">
            {error ?? 'You can change this anytime.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="klaro-switch"
          aria-checked={productUpdates}
          aria-labelledby="email-pref-product-updates"
          disabled={saving}
          onClick={onToggle}
        />
      </div>
    </div>
  )
}

/** Hidden until the preference is readable (e.g. before the marketing migration is applied). */
export default function EmailPreferencesSection() {
  const [productUpdates, setProductUpdates] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/email-preferences', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && typeof payload?.productUpdates === 'boolean') setProductUpdates(payload.productUpdates)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (productUpdates === null) return null

  const toggle = async () => {
    const next = !productUpdates
    setSaving(true)
    setError(null)
    setProductUpdates(next)
    try {
      const res = await fetch('/api/profile/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productUpdates: next }),
        credentials: 'include',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || typeof payload?.productUpdates !== 'boolean') throw new Error()
      setProductUpdates(payload.productUpdates)
    } catch {
      setProductUpdates(!next)
      setError('Could not save your preference. Please try again.')
    }
    setSaving(false)
  }

  return <EmailPreferencesCard productUpdates={productUpdates} saving={saving} error={error} onToggle={toggle} />
}
