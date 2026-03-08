'use client'

import { useState, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { INCOME_SOURCES } from '@/lib/incomeSources'
import type { ImportRow } from '@/lib/expensesImport'
import { dispatchDashboardRefresh } from '@/lib/dashboardRefresh'

const MAX_ROWS = 500
const ACCEPTED = '.csv,text/csv,text/plain'

export type ImportMode = 'expense' | 'income'

const MODE_CONFIG = {
  expense: {
    title: 'Import expenses from CSV',
    validateUrl: '/api/expenses/import',
    confirmUrl: '/api/expenses/import/confirm',
    sampleUrl: '/api/expenses/import/sample',
    sampleFilename: 'klaroph-expenses-sample.csv',
    categoryLabel: 'KlaroPH expense categories',
    categories: EXPENSE_CATEGORIES.map((c) => c.value),
    exampleCategory: 'Groceries',
    exampleAmount: '3500',
    rowLabel: (n: number) => `Import ${n} expense${n !== 1 ? 's' : ''}`,
  },
  income: {
    title: 'Import income from CSV',
    validateUrl: '/api/income/import',
    confirmUrl: '/api/income/import/confirm',
    sampleUrl: '/api/income/import/sample',
    sampleFilename: 'klaroph-income-sample.csv',
    categoryLabel: 'KlaroPH income categories',
    categories: [...INCOME_SOURCES],
    exampleCategory: 'Salary',
    exampleAmount: '50000',
    rowLabel: (n: number) => `Import ${n} income record${n !== 1 ? 's' : ''}`,
  },
} as const

type ImportCSVModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: ImportMode
}

export default function ImportCSVModal({ isOpen, onClose, onSuccess, mode }: ImportCSVModalProps) {
  const config = MODE_CONFIG[mode]
  const { features, refresh } = useSubscription()
  const { openUpgradeModal } = useUpgradeTrigger()
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [validation, setValidation] = useState<{
    ok: boolean
    rowCount: number
    rows: ImportRow[]
    errors: { row: number; field?: string; message: string }[]
    skippedEmpty: number
    unknownCategories: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importUsed = features?.import_used ?? 0
  const importLimit = features?.import_limit ?? 2
  const isPro = features?.isPro ?? false
  const quotaExhausted = !isPro && importUsed >= importLimit

  const reset = useCallback(() => {
    setFile(null)
    setValidation(null)
    setError(null)
    setLoading(false)
    setConfirming(false)
  }, [])

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files[0]
      if (!f) return
      if (!f.name.toLowerCase().endsWith('.csv') && !f.type.includes('csv') && f.type !== 'text/plain') {
        setError('Please upload a CSV file.')
        return
      }
      if (f.size > 1024 * 1024) {
        setError('File must be 1MB or smaller.')
        return
      }
      setFile(f)
      setError(null)
      setValidation(null)
    },
    []
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(null)
    setValidation(null)
  }

  const handleValidate = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(config.validateUrl, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Validation failed.')
        setValidation(null)
        setLoading(false)
        return
      }
      setValidation({
        ok: data.ok,
        rowCount: data.rowCount ?? 0,
        rows: data.rows ?? [],
        errors: data.errors ?? [],
        skippedEmpty: data.skippedEmpty ?? 0,
        unknownCategories: data.unknownCategories ?? [],
      })
    } catch {
      setError('Network error. Please try again.')
      setValidation(null)
    }
    setLoading(false)
  }

  const handleConfirmImport = async () => {
    if (quotaExhausted) {
      openUpgradeModal({ message: "You've used your 2 free imports. Upgrade to Pro for unlimited CSV imports and faster migration." })
      return
    }
    if (!validation?.rows?.length) return
    setConfirming(true)
    setError(null)
    try {
      const res = await fetch(config.confirmUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validation.rows }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'IMPORT_QUOTA_EXCEEDED') {
          refresh()
          openUpgradeModal({ message: "You've used your 2 free imports. Upgrade to Pro for unlimited CSV imports and faster migration." })
        } else {
          setError(data.error ?? 'Import failed.')
        }
        setConfirming(false)
        return
      }
      refresh()
      onSuccess()
      dispatchDashboardRefresh()
      handleClose()
    } catch {
      setError('Network error. Please try again.')
    }
    setConfirming(false)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={config.title} contentMaxWidth={520}>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Up to 500 rows per import. Columns: <strong>date</strong>, <strong>amount</strong>, <strong>category</strong>, <strong>description</strong>.
      </p>

      {!isPro && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          {quotaExhausted
            ? "You've used your 2 free imports. Upgrade to Pro for unlimited CSV imports."
            : `${importUsed} of ${importLimit} free imports used`}
        </p>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
          background: dragOver ? 'var(--color-blue-muted)' : 'var(--surface)',
          marginBottom: 16,
        }}
      >
        <input
          type="file"
          accept={ACCEPTED}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id={`import-csv-file-${mode}`}
        />
        <label htmlFor={`import-csv-file-${mode}`} style={{ cursor: 'pointer', display: 'block' }}>
          <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>Drop your CSV here or click to browse</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>CSV, max 1MB</p>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Accepted format</p>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Column</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 8px' }}>date</td><td style={{ padding: '6px 8px' }}>2026-03-08</td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 8px' }}>amount</td><td style={{ padding: '6px 8px' }}>{config.exampleAmount}</td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 8px' }}>category</td><td style={{ padding: '6px 8px' }}>{config.exampleCategory}</td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px 8px' }}>description</td><td style={{ padding: '6px 8px' }}>Optional</td></tr>
          </tbody>
        </table>
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        <a href={config.sampleUrl} download={config.sampleFilename} style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
          Download sample CSV
        </a>
      </p>

      <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{config.categoryLabel}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {config.categories.map((c) => (
          <span key={c} style={{ fontSize: 11, padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
            {c}
          </span>
        ))}
      </div>

      {file && !validation && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>Selected: {file.name}</p>
          <button
            type="button"
            onClick={handleValidate}
            disabled={loading}
            style={{
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Validating…' : 'Validate file'}
          </button>
        </div>
      )}

      {validation && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{file?.name}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            {validation.rowCount} row{validation.rowCount !== 1 ? 's' : ''} detected
            {validation.skippedEmpty > 0 && ` · ${validation.skippedEmpty} empty row(s) skipped`}
          </p>
          {validation.errors.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-error)' }}>
              {validation.errors.length} error(s): {validation.errors.slice(0, 3).map((e) => `Row ${e.row} ${e.message}`).join('; ')}
              {validation.errors.length > 3 && '…'}
            </p>
          )}
        </div>
      )}

      {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}

      {validation && validation.rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {quotaExhausted ? (
            <button
              type="button"
              onClick={() => openUpgradeModal({ message: "You've used your 2 free imports. Upgrade to Pro for unlimited CSV imports and faster migration." })}
              style={{
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Upgrade to Pro for unlimited CSV imports
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={confirming}
              style={{
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: confirming ? 'var(--text-muted)' : 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: confirming ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? 'Importing…' : config.rowLabel(validation.rows.length)}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setFile(null); setValidation(null); setError(null); }}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Choose another file
          </button>
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={handleClose}
          style={{
            padding: '10px 16px',
            fontSize: 14,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
