'use client'

import { useEffect } from 'react'

/**
 * When the dashboard redirects here with ?r=1, do a full page load so the consent
 * page renders reliably (avoids client-side nav / stale RSC).
 */
export default function LegalUpdateReload() {
  useEffect(() => {
    window.location.replace('/legal-update')
  }, [])
  return (
    <div className="legal-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
    </div>
  )
}
