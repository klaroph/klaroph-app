'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Modal from '../ui/Modal'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function LoanCalculatorModal({ isOpen, onClose }: Props) {
  const [principal, setPrincipal] = useState('')
  const [annualRate, setAnnualRate] = useState('')
  const [termMonths, setTermMonths] = useState('')

  const result = useMemo(() => {
    const p = parseFloat(principal) || 0
    const r = (parseFloat(annualRate) || 0) / 100 / 12
    const n = parseInt(termMonths) || 0
    const hasInput = p > 0 && n > 0
    let monthly = 0
    let totalInterest = 0
    if (hasInput) {
      if (r === 0) {
        monthly = p / n
        totalInterest = 0
      } else {
        monthly = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
        totalInterest = monthly * n - p
      }
    }
    return { hasInput, monthly, totalPayment: monthly * n, totalInterest, principal: p, months: n }
  }, [principal, annualRate, termMonths])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Loan Calculator" contentMaxWidth={480}>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Estimate your monthly amortization, total interest, and total payment for any loan.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Loan Amount (PHP)
          </label>
          <input
            type="number"
            className="login-input"
            placeholder="e.g. 500000"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            min={0}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label="Loan amount (PHP)"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Annual Interest Rate (%)
          </label>
          <input
            type="number"
            className="login-input"
            placeholder="e.g. 12"
            value={annualRate}
            onChange={(e) => setAnnualRate(e.target.value)}
            min={0}
            step="0.1"
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label="Annual interest rate (percent)"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Loan Term (months)
          </label>
          <input
            type="number"
            className="login-input"
            placeholder="e.g. 36"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
            min={1}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label="Loan term in months"
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          padding: 20,
          background: 'var(--color-blue-muted)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(0,56,168,0.12)',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Monthly Amortization</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-blue)' }}>
            {result.hasInput ? `₱${result.monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Loan Amount</span>
          <span style={{ color: 'var(--text-primary)' }}>{result.hasInput ? `₱${result.principal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Interest</span>
          <span style={{ color: 'var(--color-red)' }}>{result.hasInput ? `₱${result.totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</span>
        </div>
        <div style={{ height: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Payment</span>
          <span style={{ color: 'var(--text-primary)' }}>{result.hasInput ? `₱${result.totalPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {result.hasInput ? `${result.months} monthly payments` : '—'}
        </div>
      </div>

      <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        <Link href="/dashboard/tools/loan" style={{ color: 'var(--color-primary)' }}>Open full calculator →</Link>
      </p>
    </Modal>
  )
}
