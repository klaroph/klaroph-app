'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Modal from '../ui/Modal'
import { computeSalaryResult } from '@/lib/salaryCalculations'

type Props = {
  isOpen: boolean
  onClose: () => void
}

type InputMode = 'monthly' | 'annual'

export default function SalaryCalculatorModal({ isOpen, onClose }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('monthly')
  const [grossInput, setGrossInput] = useState('')
  const [nonTaxableInput, setNonTaxableInput] = useState('')

  const nonTaxableMonthly = inputMode === 'annual' ? (parseFloat(nonTaxableInput) || 0) / 12 : (parseFloat(nonTaxableInput) || 0)

  const results = useMemo(
    () =>
      computeSalaryResult({
        grossVal: parseFloat(grossInput) || 0,
        inputMode,
        nonTaxableMonthly,
      }),
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
    <Modal isOpen={isOpen} onClose={onClose} title="Salary Calculator (PH)" contentMaxWidth={520}>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Estimate your net pay after SSS, PhilHealth, Pag-IBIG, and withholding tax. Free for Filipino private employees.
      </p>

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
          <input
            type="number"
            className="login-input"
            placeholder={inputMode === 'monthly' ? 'e.g. 30000' : 'e.g. 360000'}
            value={grossInput}
            onChange={(e) => setGrossInput(e.target.value)}
            min={0}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label={inputMode === 'monthly' ? 'Gross taxable income monthly (PHP)' : 'Gross taxable income annual (PHP)'}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Non-taxable income ({inputMode === 'monthly' ? 'monthly' : 'annual'})</label>
          <input
            type="number"
            className="login-input"
            placeholder={inputMode === 'monthly' ? 'e.g. 0' : 'e.g. 120000'}
            value={nonTaxableInput}
            onChange={(e) => setNonTaxableInput(e.target.value)}
            min={0}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label={inputMode === 'monthly' ? 'Non-taxable income monthly (PHP)' : 'Non-taxable income annual (PHP)'}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            De minimis, exclusions, or other income not subject to tax (added to take-home).
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
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
        {inputMode === 'monthly' ? (
          <Row label="Withholding tax (monthly)" value={-results.monthlyTax} empty={!results.hasInput} />
        ) : (
          <Row label="Withholding tax (annual)" value={-results.annualTax} empty={!results.hasInput} />
        )}
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

      <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        <Link href="/dashboard/tools/salary" style={{ color: 'var(--color-primary)' }}>Open full calculator →</Link>
      </p>
    </Modal>
  )
}

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
