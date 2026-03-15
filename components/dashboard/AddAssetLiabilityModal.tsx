'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import {
  ASSET_SUBTYPES,
  LIABILITY_SUBTYPES,
  SUBTYPE_LABELS,
  type AssetSubtype,
  type LiabilitySubtype,
} from '@/lib/financialAccounts'

type AddAssetLiabilityModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  defaultTab?: 'asset' | 'liability'
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  width: '100%',
  fontSize: 14,
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  color: 'var(--text-secondary)',
}

export default function AddAssetLiabilityModal({
  isOpen,
  onClose,
  onSaved,
  defaultTab = 'asset',
}: AddAssetLiabilityModalProps) {
  const [tab, setTab] = useState<'asset' | 'liability'>(defaultTab)
  const [subtype, setSubtype] = useState<string>(defaultTab === 'asset' ? 'bank_account' : 'credit_card')
  const [institutionOrLabel, setInstitutionOrLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assetSubtypes = ASSET_SUBTYPES as readonly string[]
  const liabilitySubtypes = LIABILITY_SUBTYPES as readonly string[]

  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab)
      setSubtype(defaultTab === 'asset' ? 'bank_account' : 'credit_card')
      setInstitutionOrLabel('')
      setAmount('')
      setError(null)
    }
  }, [isOpen, defaultTab])

  const reset = () => {
    setInstitutionOrLabel('')
    setAmount('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleTabChange = (newTab: 'asset' | 'liability') => {
    setTab(newTab)
    setSubtype(newTab === 'asset' ? 'bank_account' : 'credit_card')
    setInstitutionOrLabel('')
    setAmount('')
    setError(null)
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
    if (isNaN(num) || num < 0) {
      setError('Enter a valid amount.')
      setLoading(false)
      return
    }
    const type = tab === 'asset' ? 'asset' : 'liability'
    const subtypeToSave = tab === 'asset'
      ? (assetSubtypes.includes(subtype) ? subtype : 'custom')
      : (liabilitySubtypes.includes(subtype) ? subtype : 'other')
    const { error: err } = await supabase.from('financial_accounts').insert({
      user_id: user.id,
      type,
      subtype: subtypeToSave,
      institution_name: null,
      custom_name: institutionOrLabel.trim() || null,
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

  const options = tab === 'asset' ? assetSubtypes : liabilitySubtypes

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add asset or liability">
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => handleTabChange('asset')}
          className={tab === 'asset' ? 'btn-primary' : 'btn-secondary'}
          style={{ marginRight: 8, padding: '8px 16px', fontSize: 13 }}
        >
          Asset
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('liability')}
          className={tab === 'liability' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          Liability
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Category</label>
          <select
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            style={inputStyle}
            required
            aria-label="Account category"
          >
            {options.map((value) => (
              <option key={value} value={value}>
                {SUBTYPE_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Institution or label (optional)</label>
          <input
            type="text"
            value={institutionOrLabel}
            onChange={(e) => setInstitutionOrLabel(e.target.value)}
            placeholder={tab === 'asset' ? 'e.g. BPI Savings' : 'e.g. BPI Credit Card'}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Amount (₱)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            required
          />
        </div>
        {error && (
          <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : tab === 'asset' ? 'Add asset' : 'Add liability'}
        </button>
      </form>
    </Modal>
  )
}
