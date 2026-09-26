'use client'

import { useState, useMemo } from 'react'
import { formatPeso } from '@/lib/format'
import ToolSeoFaq from '@/components/tools/ToolSeoFaq'
import KlaroPageHeader from '@/components/layout/KlaroPageHeader'
import { computeLoanAmortization } from '@/lib/loanAmortization'

export default function LoanCalculator() {
  type LoanType = 'personal' | 'car' | 'housing'
  const [loanType, setLoanType] = useState<LoanType>('personal')

  const [principal, setPrincipal] = useState('')
  const [annualRate, setAnnualRate] = useState('')
  const [termMonths, setTermMonths] = useState('')

  const loanContextText =
    loanType === 'personal'
      ? 'Personal loans usually have shorter repayment periods and higher monthly amortization compared to housing loans.'
      : loanType === 'car'
        ? 'Car loans often include down payment requirements and bank processing fees.'
        : 'Housing loans usually have longer repayment periods and lower monthly installments but higher total interest over time.'

  const result = useMemo(
    () =>
      computeLoanAmortization(
        parseFloat(principal) || 0,
        parseFloat(annualRate) || 0,
        parseInt(termMonths) || 0
      ),
    [principal, annualRate, termMonths]
  )

  return (
    <div className="tool-page">
      <KlaroPageHeader
        titleAs="h1"
        title="Loan Calculator"
        description="Understand your monthly payment before you commit."
      />

      <div style={{ maxWidth: 480, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Loan Type</label>
          <div className="tool-segmented" role="group" aria-label="Loan type">
            <button
              type="button"
              className={`tool-segmented-btn${loanType === 'personal' ? ' is-active' : ''}`}
              onClick={() => setLoanType('personal')}
              aria-pressed={loanType === 'personal'}
            >
              Personal
            </button>
            <button
              type="button"
              className={`tool-segmented-btn${loanType === 'car' ? ' is-active' : ''}`}
              onClick={() => setLoanType('car')}
              aria-pressed={loanType === 'car'}
            >
              Car
            </button>
            <button
              type="button"
              className={`tool-segmented-btn${loanType === 'housing' ? ' is-active' : ''}`}
              onClick={() => setLoanType('housing')}
              aria-pressed={loanType === 'housing'}
            >
              Housing
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            background: 'var(--border-muted)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
          aria-label="Loan type explanation"
        >
          {loanContextText}
        </div>
      </div>

      <div className="dash-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Loan Amount (PHP)</label>
            <input type="number" className="login-input" placeholder="e.g. 500000" value={principal} onChange={(e) => setPrincipal(e.target.value)} min={0} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Loan amount (PHP)" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Annual Interest Rate (%)</label>
            <input type="number" className="login-input" placeholder="e.g. 12" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} min={0} step="0.1" style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Annual interest rate (percent)" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Loan Term (months)</label>
            <input type="number" className="login-input" placeholder="e.g. 36" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} min={1} style={{ width: '100%', boxSizing: 'border-box' }} aria-label="Loan term in months" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="tool-result-hero" style={{ textAlign: 'center' }}>
            <p className="tool-result-hero-label">Monthly Amortization</p>
            <p className="tool-result-hero-value">
              {result.hasInput
                ? formatPeso(result.monthly, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '—'}
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Loan Amount</span>
            <span>{result.hasInput ? formatPeso(result.principal, undefined, { minimumFractionDigits: 2 }) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Interest</span>
            <span style={{ color: 'var(--color-red)' }}>{result.hasInput ? formatPeso(result.totalInterest, undefined, { minimumFractionDigits: 2 }) : '—'}</span>
          </div>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Payment</span>
            <span>{result.hasInput ? formatPeso(result.totalPayment, undefined, { minimumFractionDigits: 2 }) : '—'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{result.hasInput ? `${result.months} monthly payments` : '—'}</div>
        </div>
      </div>

      <ToolSeoFaq
        title="Frequently Asked Questions"
        items={[
          {
            question: 'How is monthly amortization calculated in the Philippines?',
            answer:
              'This calculator uses the standard loan amortization formula based on your principal, annual interest rate, and loan term (months) to estimate your monthly payment and total interest over the loan period.',
          },
          {
            question: 'What should I compare besides the interest rate?',
            answer:
              'Compare both the monthly amortization and the total repayment (principal plus total interest) for the full loan term. A lower rate with a longer term can still cost more overall.',
          },
          {
            question: 'Can I use this calculator for car, personal, and housing loans?',
            answer:
              'Yes. Enter the loan amount, interest rate, and term for the loan you’re planning, and this tool will estimate monthly amortization and total interest.',
          },
          {
            question: 'Can I use this for car loan computation?',
            answer:
              'Yes. Choose Car Loan in the selector and enter the car loan amount, interest rate, and term to estimate your monthly amortization and total interest. Remember that your down payment and bank fees can affect your real total cost.',
          },
          {
            question: 'Why does longer loan term reduce monthly payment?',
            answer:
              'Because the principal repayment is spread across more months. While your monthly amortization may drop, the total interest you pay usually increases when the term is longer.',
          },
          {
            question: 'Does this include bank fees?',
            answer:
              'No. This calculator estimates monthly amortization and total interest based on the loan amount, interest rate, and term. Bank fees, insurance, and other charges may be added by lenders.',
          },
        ]}
      />

      <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520 }}>
        This calculator can help estimate personal loan, car loan, and housing loan monthly payments in the Philippines.
      </p>

      <section style={{ marginTop: 18 }} aria-label="Loan planning reminder">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
          Loan Planning Reminder
        </h2>
        <div
          style={{
            padding: 16,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--border-muted)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          Banks and lenders may apply additional fees, insurance, and approval conditions beyond the estimated monthly amortization shown here.
        </div>
      </section>
    </div>
  )
}
