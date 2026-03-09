'use client'

import { useState } from 'react'
import { getAssessmentText } from '@/lib/financialHealthAssessment'

export default function FinancialHealthCheckPublic() {
  const [assetsInput, setAssetsInput] = useState('')
  const [liabilitiesInput, setLiabilitiesInput] = useState('')
  const [showAssessment, setShowAssessment] = useState(false)

  const assetsSum = parseFloat(assetsInput) || 0
  const liabilitiesSum = parseFloat(liabilitiesInput) || 0
  const net = assetsSum - liabilitiesSum
  const hasInput = assetsSum > 0 || liabilitiesSum > 0

  return (
    <div className="tool-page">
      <div className="page-header">
        <h1 className="tool-page-title">Financial Health Check</h1>
        <p className="tool-page-desc">
          Enter your total assets and liabilities for a quick, free assessment. No account required.
        </p>
      </div>

      <div className="dash-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Total Assets (PHP)</label>
            <input
              type="number"
              className="login-input"
              placeholder="e.g. 500000"
              value={assetsInput}
              onChange={(e) => setAssetsInput(e.target.value)}
              min={0}
              style={{ width: '100%', boxSizing: 'border-box' }}
              aria-label="Total assets (PHP)"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Total Liabilities (PHP)</label>
            <input
              type="number"
              className="login-input"
              placeholder="e.g. 200000"
              value={liabilitiesInput}
              onChange={(e) => setLiabilitiesInput(e.target.value)}
              min={0}
              style={{ width: '100%', boxSizing: 'border-box' }}
              aria-label="Total liabilities (PHP)"
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Net worth</span>
            <span style={{ fontWeight: 600, color: net >= 0 ? 'var(--color-success)' : 'var(--color-red)' }}>
              {hasInput ? `₱${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
        </div>

        <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Free assessment</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Get a short read on your financial health based on your numbers. No data stored.
          </p>
          {!showAssessment ? (
            <button
              type="button"
              onClick={() => setShowAssessment(true)}
              style={{ padding: '10px 18px', fontSize: 14, fontWeight: 500, border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Assess my financial health
            </button>
          ) : (
            <div style={{ padding: 16, background: 'var(--border-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Assessment</div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {getAssessmentText(assetsSum, liabilitiesSum, net)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
