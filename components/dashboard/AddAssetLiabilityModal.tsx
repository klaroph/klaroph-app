'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'

type AddAssetLiabilityModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  defaultTab?: 'asset' | 'liability'
}

export default function AddAssetLiabilityModal({
  isOpen,
  onClose,
  onSaved,
  defaultTab = 'asset',
}: AddAssetLiabilityModalProps) {
  const [tab, setTab] = useState<'asset' | 'liability'>(defaultTab)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setAmount('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
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
    if (!name.trim() || isNaN(num) || num < 0) {
      setError('Enter a valid name and amount.')
      setLoading(false)
      return
    }
    const table = tab === 'asset' ? 'assets' : 'liabilities'
    const { error: err } = await supabase.from(table).insert({
      user_id: user.id,
      name: name.trim(),
      amount: num,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    reset()
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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add asset or liability">
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTab('asset')}
          style={{
            padding: '8px 16px',
            marginRight: 8,
            fontSize: 13,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            backgroundColor: tab === 'asset' ? '#059669' : '#fff',
            color: tab === 'asset' ? '#fff' : '#6b7280',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Asset
        </button>
        <button
          type="button"
          onClick={() => setTab('liability')}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            backgroundColor: tab === 'liability' ? '#059669' : '#fff',
            color: tab === 'liability' ? '#fff' : '#6b7280',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Liability
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tab === 'asset' ? 'e.g. Savings account' : 'e.g. Credit card'}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Amount (₱)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
          {loading ? 'Saving...' : tab === 'asset' ? 'Add asset' : 'Add liability'}
        </button>
      </form>
    </Modal>
  )
}
