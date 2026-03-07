'use client'

import { useState } from 'react'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'

const BUDGET_ONBOARDING_CATEGORIES = EXPENSE_CATEGORIES.filter((c) =>
  ['Groceries', 'Transportation', 'Utilities', 'Shopping', 'Health', 'Education'].includes(c.value)
)

type BudgetStepProps = {
  inputStyle: React.CSSProperties
  buttonPrimaryStyle: React.CSSProperties
  onBack: () => void
  onNext: () => void
}

export default function BudgetStep({
  inputStyle,
  buttonPrimaryStyle,
  onBack,
  onNext,
}: BudgetStepProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(BUDGET_ONBOARDING_CATEGORIES.map((c) => [c.value, '']))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    setLoading(true)
    const items = BUDGET_ONBOARDING_CATEGORIES.filter((c) => {
      const v = amounts[c.value]
      const n = parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0
      return n > 0
    }).map((c) => ({
      category: c.value,
      amount: parseFloat(String(amounts[c.value]).replace(/[^0-9.]/g, '')) || 0,
    }))

    try {
      const res = await fetch('/api/budget-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(items),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data?.error as string) || 'Failed to save plan.')
        setLoading(false)
        return
      }
      onNext()
    } catch {
      setError('Something went wrong.')
    }
    setLoading(false)
  }

  return (
    <>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
        Create your monthly spending plan
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)' }}>
        You can change these later. Set a default budget per category (0 or empty = skip).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, textAlign: 'left' }}>
        {BUDGET_ONBOARDING_CATEGORIES.map((c) => (
          <label key={c.value} style={{ display: 'block' }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              {c.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>₱</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amounts[c.value] ?? ''}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [c.value]: e.target.value }))
                }
                style={{ ...inputStyle, marginTop: 0 }}
              />
            </div>
          </label>
        ))}
      </div>
      {error && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            ...buttonPrimaryStyle,
            backgroundColor: 'var(--surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          style={{
            ...buttonPrimaryStyle,
            opacity: loading ? 0.8 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving…' : 'Save Budgets'}
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{
            ...buttonPrimaryStyle,
            backgroundColor: 'var(--surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          Skip for now
        </button>
      </div>
    </>
  )
}
