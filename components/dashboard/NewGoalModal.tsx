'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import { GOAL_PRESETS } from '../../lib/goalPresets'

export type GoalForEdit = {
  id: string
  name: string
  target_amount: number
}

type NewGoalModalProps = {
  isOpen: boolean
  onClose: () => void
  onGoalCreated: () => void
  /** When set, modal is in edit mode: title "Edit goal", pre-fill, submit = PUT */
  initialGoal?: GoalForEdit | null
}

function GoalPresetIcon({ icon }: { icon: string }) {
  if (icon === 'travel') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1.2-1.82l-7-3.5a2 2 0 0 0-1.6 0L3.2 6.18A2 2 0 0 0 2 8v8a2 2 0 0 0 1.2 1.82l7 3.5a2 2 0 0 0 1.6 0l7-3.5A2 2 0 0 0 21 16Z" />
        <path d="M12 12v9" /><path d="M12 12 2 8" /><path d="M12 12l10-4" />
      </svg>
    )
  }
  if (icon === 'money') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }
  if (icon === 'education') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        <path d="M8 7h8" /><path d="M8 11h6" />
      </svg>
    )
  }
  if (icon === 'house') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  )
}

export default function NewGoalModal({ isOpen, onClose, onGoalCreated, initialGoal = null }: NewGoalModalProps) {
  const [presetId, setPresetId] = useState<string>('custom')
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = Boolean(initialGoal?.id)

  useEffect(() => {
    if (isOpen && initialGoal) {
      setName(initialGoal.name)
      setTargetAmount(String(initialGoal.target_amount))
      setPresetId('custom')
    }
  }, [isOpen, initialGoal])

  useEffect(() => {
    if (isOpen && !initialGoal && presetId !== 'custom') {
      const p = GOAL_PRESETS.find((x) => x.id === presetId)
      setName(p ? p.defaultName : '')
    }
  }, [isOpen, presetId, initialGoal])

  const handleClose = () => {
    setPresetId('custom')
    setName('')
    setTargetAmount('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in to create a goal.')
      setLoading(false)
      return
    }
    const amount = parseFloat(targetAmount)
    if (!name.trim() || isNaN(amount) || amount <= 0) {
      setError('Please enter a valid name and target amount.')
      setLoading(false)
      return
    }

    if (isEditMode && initialGoal) {
      const res = await fetch(`/api/goals/${initialGoal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), target_amount: amount }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) {
        setError((data?.error as string) ?? 'Could not update goal.')
        return
      }
    } else {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), target_amount: amount }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) {
        if (res.status === 403 && data?.upgrade_required) {
          setError("You've reached your Free plan limit (2/2 goals). Upgrade to Pro to create up to 20 goals.")
        } else {
          setError((data?.error as string) ?? (res.status === 403 ? 'Goal limit reached.' : 'Could not create goal.'))
        }
        return
      }
    }
    handleClose()
    onGoalCreated()
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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditMode ? 'Edit goal' : 'New goal'}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Category (optional)
          </label>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            style={inputStyle}
          >
            {GOAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === 'custom' ? 'Custom' : `${p.label} — ${p.defaultName}`}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Goal name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Target amount (₱)
          </label>
          <input
            type="number"
            min="1"
            step="any"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
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
          {loading ? (isEditMode ? 'Saving...' : 'Adding...') : (isEditMode ? 'Save changes' : 'Add goal')}
        </button>
      </form>
    </Modal>
  )
}
