'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '../ui/Modal'
import { EXPENSE_CATEGORIES, getTypeForCategory } from '../../lib/expenseCategories'

export type ExpenseRecord = {
  id: string
  category: string
  type: 'needs' | 'wants'
  amount: number
  date: string
  description?: string | null
}

type EditExpenseModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  expense: ExpenseRecord | null
}

export default function EditExpenseModal({
  isOpen,
  onClose,
  onSaved,
  expense,
}: EditExpenseModalProps) {
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budgetNotes, setBudgetNotes] = useState<Record<string, string>>({})
  const budgetNotesFetched = useRef(false)

  useEffect(() => {
    if (expense) {
      setCategory(expense.category)
      setDescription(expense.description ?? '')
      setAmount(String(expense.amount))
      setDate(expense.date)
    }
  }, [expense])

  useEffect(() => {
    if (!isOpen || budgetNotesFetched.current) return
    budgetNotesFetched.current = true
    fetch('/api/budget-plan', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (!Array.isArray(data)) return
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
  }, [isOpen])

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expense) return
    setError(null)
    setLoading(true)
    const num = parseFloat(amount)
    if (!category || isNaN(num) || num <= 0) {
      setError('Select a category and enter a valid amount.')
      setLoading(false)
      return
    }
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: category.trim(),
        amount: num,
        date,
        description: description.trim() || null,
      }),
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError((data?.error as string) ?? 'Could not update expense.')
      return
    }
    handleClose()
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    width: '100%',
    fontSize: 14,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  if (!expense) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit expense">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
              {budgetNotes[category]}
            </p>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Free text note"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Amount (₱)
          </label>
          <input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
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
          <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 18px',
            fontSize: 14,
            border: 'none',
            borderRadius: 8,
            backgroundColor: '#059669',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </Modal>
  )
}
