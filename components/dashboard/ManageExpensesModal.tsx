'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import AddExpenseModal from './AddExpenseModal'
import EditExpenseModal, { type ExpenseRecord } from './EditExpenseModal'
import { toLocalDateString } from '@/lib/format'
import { EXPENSE_CATEGORIES } from '../../lib/expenseCategories'

type DatePreset = 'current_month' | 'last_3_months' | 'all'

function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  const now = new Date()
  if (preset === 'all') return null
  if (preset === 'current_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toLocalDateString(from), to: toLocalDateString(to) }
  }
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  return { from: toLocalDateString(from), to: toLocalDateString(to) }
}

type ManageExpensesModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export default function ManageExpensesModal({ isOpen, onClose, onSaved }: ManageExpensesModalProps) {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('current_month')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'needs' | 'wants'>('all')

  const loadExpenses = async () => {
    if (!isOpen) return
    setLoading(true)
    const range = getDateRange(datePreset)
    let q = supabase.from('expenses').select('id, category, type, amount, date, description').order('date', { ascending: false })
    if (range) q = q.gte('date', range.from).lte('date', range.to)
    if (categoryFilter) q = q.eq('category', categoryFilter)
    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    const { data } = await q
    setExpenses((data as ExpenseRecord[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (isOpen) loadExpenses()
  }, [isOpen, datePreset, categoryFilter, typeFilter])

  const handleAddSaved = () => {
    setAddModalOpen(false)
    loadExpenses()
    onSaved()
  }

  const handleEditSaved = () => {
    setEditingExpense(null)
    loadExpenses()
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Manage expenses" contentMaxWidth={720}>
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              border: 'none',
              borderRadius: 8,
              backgroundColor: '#059669',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            Add
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Date:</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              style={inputStyle}
            >
              <option value="current_month">This month</option>
              <option value="last_3_months">Last 3 months</option>
              <option value="all">All time</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ ...inputStyle, minWidth: 140 }}
            >
              <option value="">All</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'needs' | 'wants')}
              style={inputStyle}
            >
              <option value="all">All</option>
              <option value="needs">Needs</option>
              <option value="wants">Wants</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>Loading...</p>
        ) : expenses.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>No expenses match the filters.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 400, overflow: 'auto' }}>
            {expenses.map((row) => (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid #f3f4f6',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                    {row.category}
                    {row.description ? ` · ${row.description}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {row.date} · {row.type}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  ₱{Number(row.amount).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingExpense(row)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    backgroundColor: '#fff',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <AddExpenseModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={handleAddSaved}
      />
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        onSaved={handleEditSaved}
        expense={editingExpense}
      />
    </>
  )
}
