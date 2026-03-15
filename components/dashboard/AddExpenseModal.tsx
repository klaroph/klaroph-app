'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import {
  EXPENSE_CATEGORIES,
  getTypeForCategory,
} from '../../lib/expenseCategories'
import { toLocalDateString } from '@/lib/format'
import { suggestCategoriesFromDescription } from '../../lib/expenseCategorySuggestion'

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

  const suggestionResult = useMemo(
    () => (description.trim() ? suggestCategoriesFromDescription(description) : { suggestions: [], confidence: 'low' as const }),
    [description]
  )

  const showChips = suggestionResult.confidence === 'high' || suggestionResult.confidence === 'medium'
  const chips = showChips ? suggestionResult.suggestions : []

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

  const handleChipClick = (selectedCategory: string) => {
    setCategory(selectedCategory)
  }

  const handleCategoryChange = (value: string) => {
    setCategory(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
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

          {/* 2. Suggested category chips — only when high or medium confidence */}
          {chips.length > 0 && (
            <>
              <div className="add-expense-suggestion-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6 }}>
                <span className="add-expense-suggestion-stars" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                  </svg>
                </span>
                <span>Suggested category</span>
              </div>
              <div
                className="add-expense-chips"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}
              >
                {chips.map((s) => (
                  <button
                    key={s.category}
                    type="button"
                    className={`add-expense-chip add-expense-chip-gradient ${category === s.category ? 'active' : ''}`}
                    onClick={() => handleChipClick(s.category)}
                  >
                    {s.category}
                  </button>
                ))}
              </div>
            </>
          )}
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
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            borderRadius: 8,
            backgroundColor: 'var(--color-success, #059669)',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            width: '100%',
            transition: 'opacity 0.15s ease',
          }}
        >
          {loading ? 'Saving...' : 'Add expense'}
        </button>
      </form>
    </Modal>
  )
}
