'use client'

import { useState } from 'react'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'

const BUDGET_ONBOARDING_CATEGORIES = EXPENSE_CATEGORIES.filter((c) =>
  ['Groceries', 'Transportation', 'Utilities', 'Shopping', 'Health', 'Education'].includes(c.value)
)

type BudgetStepProps = {
  onBack: () => void
  onNext: () => void
}

export default function BudgetStep({ onBack, onNext }: BudgetStepProps) {
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
      <h2 className="onb-title">Create your monthly spending plan</h2>
      <p className="onb-lead">
        Set a budget for the categories you use. Leave any blank to skip — you can change these later.
      </p>
      <div className="onb-budget-grid">
        {BUDGET_ONBOARDING_CATEGORIES.map((c) => (
          <label key={c.value} className="onb-field onb-field--tight">
            <span className="onb-label">{c.label}</span>
            <span className="onb-peso-input">
              <span aria-hidden="true">₱</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amounts[c.value] ?? ''}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [c.value]: e.target.value }))
                }
                className="login-input"
              />
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="onb-error" role="alert">{error}</p>
      )}
      <div className="onb-actions">
        <button type="button" onClick={onBack} className="btn-secondary onb-btn">
          Back
        </button>
        <button type="button" onClick={onNext} className="btn-ghost onb-btn">
          Skip for now
        </button>
        <button type="button" onClick={handleSave} disabled={loading} className="btn-primary onb-btn">
          {loading ? 'Saving…' : 'Save Budgets'}
        </button>
      </div>
    </>
  )
}
