'use client'

import { useState, useMemo } from 'react'

const THIRTEENTH_MONTH_TAXABLE_THRESHOLD = 90_000

export default function ThirteenthMonthCalculator() {
  const [basicSalary, setBasicSalary] = useState('')
  const [monthsWorked, setMonthsWorked] = useState('12')
  const result = useMemo(() => {
    const salary = parseFloat(basicSalary) || 0
    const months = Math.min(12, Math.max(0, parseInt(monthsWorked) || 0))
    const hasInput = salary > 0 && months > 0
    const thirteenthMonth = hasInput ? (salary * months) / 12 : 0
    const isTaxable = thirteenthMonth > THIRTEENTH_MONTH_TAXABLE_THRESHOLD
    const taxableExcess = isTaxable ? thirteenthMonth - THIRTEENTH_MONTH_TAXABLE_THRESHOLD : 0
    return { hasInput, thirteenthMonth, months, isTaxable, taxableExcess }
  }, [basicSalary, monthsWorked])

  return (
    <div className="tool-page">
      <div className="page-header">
        <h1 className="tool-page-title">13th Month Pay Calculator Philippines</h1>
        <p className="tool-page-desc">Calculate your 13th month pay from basic monthly salary and months worked. Free for Filipino workers.</p>
      </div>
      <div className="dash-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Basic Monthly Salary (PHP)</label>
            <input type="number" className="login-input" placeholder="e.g. 25000" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} min={0} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Basic monthly salary (PHP)" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Months Worked</label>
            <input type="number" className="login-input" placeholder="12" value={monthsWorked} onChange={(e) => setMonthsWorked(e.target.value)} min={1} max={12} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Months worked in the year" />
          </div>
        </div>
        <div style={{ padding: 20, background: 'var(--color-blue-muted)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,56,168,0.12)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>13th Month Pay ({result.months} months)</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-blue)', marginBottom: 12 }}>
            {result.hasInput ? `₱${result.thirteenthMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {result.hasInput
              ? (result.isTaxable ? `Taxable excess above ₱${THIRTEENTH_MONTH_TAXABLE_THRESHOLD.toLocaleString()}: ₱${result.taxableExcess.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `Non-taxable (within ₱${THIRTEENTH_MONTH_TAXABLE_THRESHOLD.toLocaleString()} threshold)`)
              : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Formula: (Basic Salary x Months Worked) / 12</div>
        </div>
      </div>
    </div>
  )
}
