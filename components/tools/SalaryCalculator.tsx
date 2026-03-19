'use client'

import { useState, useMemo } from 'react'
import { computeSalaryResult } from '@/lib/salaryCalculations'
import ToolSeoFaq from '@/components/tools/ToolSeoFaq'

function Row({ label, value, bold, color, empty }: { label: string; value: number; bold?: boolean; color?: string; empty?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: bold ? 600 : 400 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)' }}>
        {empty ? '—' : `${value < 0 ? '-' : ''}₱${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  )
}
function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
}

type InputMode = 'monthly' | 'annual'

export default function SalaryCalculator() {
  const [inputMode, setInputMode] = useState<InputMode>('monthly')
  const [grossInput, setGrossInput] = useState('')
  const [nonTaxableInput, setNonTaxableInput] = useState('')
  const nonTaxableMonthly = inputMode === 'annual' ? (parseFloat(nonTaxableInput) || 0) / 12 : (parseFloat(nonTaxableInput) || 0)
  const results = useMemo(
    () => computeSalaryResult({ grossVal: parseFloat(grossInput) || 0, inputMode, nonTaxableMonthly }),
    [grossInput, nonTaxableMonthly, inputMode]
  )
  const setInputModeWithConversion = (mode: InputMode) => {
    if (mode === inputMode) return
    const val = parseFloat(nonTaxableInput) || 0
    if (inputMode === 'monthly' && mode === 'annual') setNonTaxableInput(val ? String(Math.round(val * 12)) : '')
    else if (inputMode === 'annual' && mode === 'monthly') setNonTaxableInput(val ? String(Math.round((val / 12) * 100) / 100) : '')
    setInputMode(mode)
  }

  return (
    <div className="tool-page">
      <header className="page-header">
        <h1 className="tool-page-title">Salary Calculator Philippines</h1>
        <p className="tool-page-desc">
          A salary calculator helps estimate take-home pay after deductions in the Philippines, including government contributions and taxes.
        </p>
      </header>
      <div className="dash-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" checked={inputMode === 'monthly'} onChange={() => setInputModeWithConversion('monthly')} />
                Monthly
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" checked={inputMode === 'annual'} onChange={() => setInputModeWithConversion('annual')} />
                Annual
              </label>
            </div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Gross taxable income ({inputMode === 'monthly' ? 'monthly' : 'annual'})</label>
            <input type="number" className="login-input" placeholder={inputMode === 'monthly' ? 'e.g. 30000' : 'e.g. 360000'} value={grossInput} onChange={(e) => setGrossInput(e.target.value)} min={0} style={{ width: '100%', boxSizing: 'border-box' }} aria-label={inputMode === 'monthly' ? 'Gross taxable income monthly (PHP)' : 'Gross taxable income annual (PHP)'} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Non-taxable income ({inputMode === 'monthly' ? 'monthly' : 'annual'})</label>
            <input type="number" className="login-input" placeholder={inputMode === 'monthly' ? 'e.g. 0' : 'e.g. 120000'} value={nonTaxableInput} onChange={(e) => setNonTaxableInput(e.target.value)} min={0} style={{ width: '100%', boxSizing: 'border-box' }} aria-label={inputMode === 'monthly' ? 'Non-taxable income monthly (PHP)' : 'Non-taxable income annual (PHP)'} />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>De minimis, exclusions, or other income not subject to tax (added to take-home).</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inputMode === 'monthly' ? (
            <>
              <Row label="Gross taxable income (monthly)" value={results.monthlyGross} bold empty={!results.hasInput} />
              <Row label="Non-taxable income (monthly)" value={results.nonTaxableMonthly} empty={!results.hasInput} />
            </>
          ) : (
            <>
              <Row label="Gross taxable income (annual)" value={results.annualGross} bold empty={!results.hasInput} />
              <Row label="Non-taxable income (annual)" value={results.nonTaxableAnnual} empty={!results.hasInput} />
            </>
          )}
          <Divider />
          {inputMode === 'monthly' ? (
            <>
              <Row label="SSS" value={-results.sss} empty={!results.hasInput} />
              <Row label="PhilHealth" value={-results.philHealth} empty={!results.hasInput} />
              <Row label="Pag-IBIG" value={-results.pagIBIG} empty={!results.hasInput} />
              <Row label="Total contributions" value={-results.totalContrib} color="var(--color-red)" empty={!results.hasInput} />
            </>
          ) : (
            <>
              <Row label="SSS (annual)" value={-results.sss * 12} empty={!results.hasInput} />
              <Row label="PhilHealth (annual)" value={-results.philHealth * 12} empty={!results.hasInput} />
              <Row label="Pag-IBIG (annual)" value={-results.pagIBIG * 12} empty={!results.hasInput} />
              <Row label="Total contributions (annual)" value={-results.totalContrib * 12} color="var(--color-red)" empty={!results.hasInput} />
            </>
          )}
          <Divider />
          {inputMode === 'monthly' ? <Row label="Withholding tax (monthly)" value={-results.monthlyTax} empty={!results.hasInput} /> : <Row label="Withholding tax (annual)" value={-results.annualTax} empty={!results.hasInput} />}
          <Divider />
          {inputMode === 'monthly' ? (
            <>
              <Row label="Net pay (monthly)" value={results.netPayMonthly} bold color="var(--color-success)" empty={!results.hasInput} />
              <Row label="Net pay (semi-monthly)" value={results.netPaySemiMonthly} empty={!results.hasInput} />
            </>
          ) : (
            <Row label="Net pay (annual)" value={results.netPayAnnual} bold color="var(--color-success)" empty={!results.hasInput} />
          )}
        </div>
      </div>

      <ToolSeoFaq
        title="Frequently Asked Questions"
        items={[
          {
            question: 'What does this salary calculator estimate?',
            answer:
              'It estimates take-home pay by calculating SSS, PhilHealth, and Pag-IBIG contributions, then estimating withholding tax, and finally adding any non-taxable income you enter.',
          },
          {
            question: 'Does it include SSS, PhilHealth, and Pag-IBIG deductions?',
            answer:
              'Yes. The calculator computes SSS, PhilHealth, and Pag-IBIG based on your gross taxable income inputs, then uses those deductions to produce the net pay estimate.',
          },
          {
            question: 'Why might my result differ from my payslip?',
            answer:
              'Your payslip may include additional adjustments, different exemptions, and payroll rounding. Use this tool as an estimate and compare the main deductions (contributions and withholding tax) with your payslip.',
          },
        ]}
      />
    </div>
  )
}
