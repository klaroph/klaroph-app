'use client'

import { useState } from 'react'
import PremiumBadge from '@/components/ui/PremiumBadge'

type Props = {
  isPro: boolean
}

export default function ExportCsvButton({ isPro }: Props) {
  const [exportLoading, setExportLoading] = useState(false)

  if (!isPro) {
    return (
      <span title="CSV export available in Pro plan." className="premium-btn-disabled">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Export CSV
        <PremiumBadge size="sm" />
      </span>
    )
  }

  return (
    <button
      type="button"
      className="btn-secondary"
      style={{ padding: '8px 14px', fontSize: 14 }}
      disabled={exportLoading}
      onClick={async () => {
        setExportLoading(true)
        try {
          const res = await fetch('/api/analytics/export', { credentials: 'include' })
          if (res.ok) {
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'klaroph-export.csv'
            a.click()
            URL.revokeObjectURL(url)
          }
        } finally {
          setExportLoading(false)
        }
      }}
    >
      {exportLoading ? 'Exporting…' : 'Export CSV'}
    </button>
  )
}
