'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase, getBrowserUser } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import SuggestionChips from './SuggestionChips'
import {
  EXPENSE_CATEGORIES,
  getTypeForCategory,
} from '../../lib/expenseCategories'
import { toLocalDateString } from '@/lib/format'
import { classifyTransactionDescription } from '@/lib/transactionSuggestion'

type AddExpenseModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export default function AddExpenseModal({ isOpen, onClose, onSaved }: AddExpenseModalProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestedCategories = useMemo(() => classifyTransactionDescription('expense', description), [description])

  const [budgetNotes, setBudgetNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetch('/api/budget-plan', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return
        const map: Record<string, string> = {}
        for (const row of data) {
          const r = row as { category?: string; note?: string | null }
          if (r.category && typeof r.note === 'string' && r.note.trim()) {
            map[r.category] = r.note.trim()
          }
        }
        setBudgetNotes(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOpen])

  const handleClose = () => {
    setDescription('')
    setAmount('')
    setCategory('')
    setDate(toLocalDateString(new Date()))
    setError(null)
    onClose()
  }

  const handleCategoryChange = (value: string) => {
    setCategory(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data: { user } } = await getBrowserUser()
    if (!user) {
      setError('Not authenticated.')
      setLoading(false)
      return
    }
    const num = parseFloat(amount)
    if (!category || isNaN(num) || num <= 0) {
      setError('Select a category and enter a valid amount.')
      setLoading(false)
      return
    }
    const type = getTypeForCategory(category)
    const payload: Record<string, unknown> = {
      user_id: user.id,
      category: category.trim(),
      type,
      amount: num,
      date,
    }
    if (description.trim()) payload.description = description.trim()
    const { error: err } = await supabase.from('expenses').insert(payload)
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    handleClose()
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    padding: '12px 14px',
    width: '100%',
    fontSize: 14,
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary, #374151)',
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add expense">
      <form onSubmit={handleSubmit}>
        {/* 1. Description */}
        <div className="add-expense-field" style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Grab ride to Ortigas, tinapa 200"
            style={inputStyle}
            autoComplete="off"
          />

          <SuggestionChips
            label="Suggested category"
            chips={suggestedCategories}
            selected={category}
            onSelect={setCategory}
          />
        </div>

        {/* 3. Amount */}
        <div className="add-expense-field" style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Amount (₱)
          </label>
          <input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={inputStyle}
            required
          />
        </div>

        {/* 4. Category */}
        <div className="add-expense-field" style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Category
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={inputStyle}
            required
          >
            <option value="">Select category</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({c.type})
              </option>
            ))}
          </select>
          {category && budgetNotes[category] && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.4 }}>
              {budgetNotes[category]}
            </p>
          )}
        </div>

        {/* 5. Date */}
        <div className="add-expense-field" style={{ marginBottom: 24 }}>
          <label style={labelStyle}>
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: 'var(--color-danger, #b91c1c)' }}>{error}</p>
        )}
        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>
          {loading ? 'Saving...' : 'Add expense'}
        </button>
      </form>
    </Modal>
  )
}
