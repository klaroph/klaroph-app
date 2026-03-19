'use client'

import { useState, useMemo } from 'react'
import ToolSeoFaq from '@/components/tools/ToolSeoFaq'

const THIRTEENTH_MONTH_TAXABLE_THRESHOLD = 90_000
type ThirteenthMonthMode = 'simple' | 'exact'

export default function ThirteenthMonthCalculator() {
  const [mode, setMode] = useState<ThirteenthMonthMode>('simple')

  const [basicSalary, setBasicSalary] = useState('')
  const [monthsWorked, setMonthsWorked] = useState('12')
  const [totalBasicSalaryEarnedThisYear, setTotalBasicSalaryEarnedThisYear] = useState('')

  const result = useMemo(() => {
    if (mode === 'exact') {
      const total = parseFloat(totalBasicSalaryEarnedThisYear) || 0
      const hasInput = total > 0
      const thirteenthMonth = hasInput ? total / 12 : 0
      const isTaxable = thirteenthMonth > THIRTEENTH_MONTH_TAXABLE_THRESHOLD
      const taxableExcess = isTaxable ? thirteenthMonth - THIRTEENTH_MONTH_TAXABLE_THRESHOLD : 0
      return {
        hasInput,
        thirteenthMonth,
        months: 0,
        isTaxable,
        taxableExcess,
        headerSuffix: '(prorated)',
        formulaText: 'Formula: Total Basic Salary Earned This Year ÷ 12',
      }
    }

    // Simple Estimate mode (existing behavior)
    const salary = parseFloat(basicSalary) || 0
    const months = Math.min(12, Math.max(0, parseInt(monthsWorked) || 0))
    const hasInput = salary > 0 && months > 0
    const thirteenthMonth = hasInput ? (salary * months) / 12 : 0
    const isTaxable = thirteenthMonth > THIRTEENTH_MONTH_TAXABLE_THRESHOLD
    const taxableExcess = isTaxable ? thirteenthMonth - THIRTEENTH_MONTH_TAXABLE_THRESHOLD : 0
    return {
      hasInput,
      thirteenthMonth,
      months,
      isTaxable,
      taxableExcess,
      headerSuffix: `(${months} months)`,
      formulaText: 'Formula: (Basic Salary × Months Worked) ÷ 12',
    }
  }, [mode, basicSalary, monthsWorked, totalBasicSalaryEarnedThisYear])

  return (
    <div className="tool-page">
      <div className="page-header">
        <h1 className="tool-page-title">13th Month Pay Calculator Philippines</h1>
        <p className="tool-page-desc">
          Compute your estimated 13th month pay based on Philippine labor rules using KlaroPH&apos;s free calculator.
        </p>
      </div>

      <div style={{ margin: '0 0 18px', display: 'flex', gap: 12, flexWrap: 'wrap' }} aria-label="13th month calculation mode">
        <button
          type="button"
          onClick={() => setMode('simple')}
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(0,56,168,0.2)',
            background: mode === 'simple' ? 'var(--color-blue-muted)' : 'var(--surface)',
            color: mode === 'simple' ? 'var(--color-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          aria-pressed={mode === 'simple'}
        >
          Simple Estimate
        </button>
        <button
          type="button"
          onClick={() => setMode('exact')}
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(0,56,168,0.2)',
            background: mode === 'exact' ? 'var(--color-blue-muted)' : 'var(--surface)',
            color: mode === 'exact' ? 'var(--color-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          aria-pressed={mode === 'exact'}
        >
          Exact Computation
        </button>
      </div>

      <div className="dash-card" style={{ maxWidth: 480 }}>
        {mode === 'simple' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Basic Monthly Salary (PHP)</label>
              <input
                type="number"
                className="login-input"
                placeholder="e.g. 25000"
                value={basicSalary}
                onChange={(e) => setBasicSalary(e.target.value)}
                min={0}
                style={{ width: '100%', boxSizing: 'border-box' }}
                aria-label="Basic monthly salary (PHP)"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Months Worked</label>
              <input
                type="number"
                className="login-input"
                placeholder="12"
                value={monthsWorked}
                onChange={(e) => setMonthsWorked(e.target.value)}
                min={1}
                max={12}
                style={{ width: '100%', boxSizing: 'border-box' }}
                aria-label="Months worked in the year"
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                Total Basic Salary Earned This Year (PHP)
              </label>
              <input
                type="number"
                className="login-input"
                placeholder="e.g. 300000"
                value={totalBasicSalaryEarnedThisYear}
                onChange={(e) => setTotalBasicSalaryEarnedThisYear(e.target.value)}
                min={0}
                style={{ width: '100%', boxSizing: 'border-box' }}
                aria-label="Total basic salary earned this year (PHP)"
              />
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Supports partial months, resignation, and irregular salary periods.
              </p>
            </div>
          </div>
        )}

        <div style={{ padding: 20, background: 'var(--color-blue-muted)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(0,56,168,0.12)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            13th Month Pay {result.headerSuffix}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-blue)', marginBottom: 12 }}>
            {result.hasInput ? `₱${result.thirteenthMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {result.hasInput
              ? (result.isTaxable ? `Taxable excess above ₱${THIRTEENTH_MONTH_TAXABLE_THRESHOLD.toLocaleString()}: ₱${result.taxableExcess.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `Non-taxable (within ₱${THIRTEENTH_MONTH_TAXABLE_THRESHOLD.toLocaleString()} threshold)`)
              : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{result.formulaText}</div>
        </div>
      </div>

      <p style={{ margin: '20px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 560 }}>
        For employees with partial months, resignation, or irregular salary periods, the most accurate method is total basic
        salary earned during the year divided by 12.
      </p>

      <ToolSeoFaq
        title="Frequently Asked Questions"
        items={[
          {
            question: 'Is 13th month pay taxable in the Philippines?',
            answer:
              'This calculator flags taxable situations when your estimated 13th month pay exceeds ₱90,000, and it shows the taxable excess portion above that threshold.',
          },
          {
            question: 'How do months worked affect the result?',
            answer:
              'Your estimate is computed as (basic monthly salary × months worked) ÷ 12. Enter fewer months worked to get a proportionally lower estimate.',
          },
          {
            question: 'Can I use this calculator for my own 13th month pay?',
            answer:
              'It estimates using your basic monthly salary and months worked. For variable pay or other special payroll adjustments, treat the result as an estimate and verify with your payslip or HR.',
          },
          {
            question: 'Who is entitled to 13th month pay in the Philippines?',
            answer:
              'Rank-and-file private employees who worked at least one month during the calendar year are generally entitled to receive 13th month pay.',
          },
          {
            question: 'How do I calculate 13th month pay for partial months?',
            answer:
              'The most accurate way is total basic salary earned during the year divided by 12.',
          },
        ]}
      />

      <section
        style={{
          marginTop: 28,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
        }}
        aria-label="13th month pay rules in the Philippines"
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          13th Month Pay Rules in the Philippines
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 14 }}>
          <li>13th month pay applies to rank-and-file private employees who worked at least one month during the calendar year.</li>
          <li>Employers must release 13th month pay not later than December 24.</li>
          <li>Standard formula uses total basic salary earned divided by 12.</li>
          <li>Employees paid by commission, task basis, or fixed wage may still qualify depending on salary structure.</li>
        </ul>
      </section>
    </div>
  )
}
