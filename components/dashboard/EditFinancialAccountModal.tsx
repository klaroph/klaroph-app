'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import {
  ASSET_SUBTYPES,
  LIABILITY_SUBTYPES,
  SUBTYPE_LABELS,
  type FinancialAccount,
} from '@/lib/financialAccounts'

type EditFinancialAccountModalProps = {
  isOpen: boolean
  onClose: () => void
  account: FinancialAccount | null
  onSaved: () => void
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

export default function EditFinancialAccountModal({
  isOpen,
  onClose,
  account,
  onSaved,
}: EditFinancialAccountModalProps) {
  const [subtype, setSubtype] = useState('')
  const [institutionOrLabel, setInstitutionOrLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (account) {
      const options = account.type === 'asset' ? (ASSET_SUBTYPES as readonly string[]) : (LIABILITY_SUBTYPES as readonly string[])
      const validSubtype = options.includes(account.subtype) ? account.subtype : (account.type === 'asset' ? 'custom' : 'other')
      setSubtype(validSubtype)
      setInstitutionOrLabel(account.institution_name?.trim() || account.custom_name?.trim() || '')
      setAmount(String(account.amount))
      setError(null)
    }
  }, [account])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account) return
    setError(null)
    setLoading(true)
    const num = parseFloat(amount)
    if (isNaN(num) || num < 0) {
      setError('Enter a valid amount.')
      setLoading(false)
      return
    }
    const options = account.type === 'asset' ? (ASSET_SUBTYPES as readonly string[]) : (LIABILITY_SUBTYPES as readonly string[])
    const subtypeToSave = options.includes(subtype) ? subtype : (account.type === 'asset' ? 'custom' : 'other')
    const { error: err } = await supabase
      .from('financial_accounts')
      .update({
        subtype: subtypeToSave,
        institution_name: null,
        custom_name: institutionOrLabel.trim() || null,
        amount: num,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    onClose()
  }

  if (!account) return null

  const options = account.type === 'asset' ? (ASSET_SUBTYPES as readonly string[]) : (LIABILITY_SUBTYPES as readonly string[])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit account">
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
            placeholder={account.type === 'asset' ? 'e.g. BPI Savings' : 'e.g. BPI Credit Card'}
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
        {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
