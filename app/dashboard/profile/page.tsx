'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProfileWithComputed } from '@/types/profile'
import {
  INCOME_RANGES,
  RISK_COMFORT_OPTIONS,
  FINANCIAL_STAGES,
  MOTIVATION_TYPES,
} from '@/types/profile'
import ClarityBadge from '@/components/profile/ClarityBadge'
import ProfileActionCTA from '@/components/profile/ProfileActionCTA'
import DeleteAccountSection from '@/components/profile/DeleteAccountSection'


type ProfileState = {
  nickname: string
  monthly_income_range: string
  primary_goal_category: string
  financial_stage: string
  savings_confidence: number | null
  risk_comfort: string
  motivation_type: string
  dream_statement: string
}


const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
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
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileWithComputed | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<ProfileState>({
    nickname: '',
    monthly_income_range: '',
    primary_goal_category: '',
    financial_stage: '',
    savings_confidence: null,
    risk_comfort: '',
    motivation_type: '',
    dream_statement: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err?.error ?? 'Could not load profile.')
        setLoading(false)
        return
      }
      const payload: ProfileWithComputed = await res.json()
      setData(payload)
      const p = payload.profile
      setForm({
        nickname: p.nickname ?? '',
        monthly_income_range: p.monthly_income_range ?? '',
        primary_goal_category: p.primary_goal_category ?? '',
        financial_stage: p.financial_stage ?? '',
        savings_confidence: p.savings_confidence ?? null,
        risk_comfort: p.risk_comfort ?? '',
        motivation_type: p.motivation_type ?? '',
        dream_statement: p.dream_statement ?? '',
      })
    } catch {
      setError('Something went wrong.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (updates: Partial<ProfileState>) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload?.error ?? 'Could not save.')
        setSaving(false)
        return
      }
      setData(payload)
      setForm((prev) => ({ ...prev, ...updates }))
    } catch {
      setError('Something went wrong.')
    }
    setSaving(false)
  }

  const handleBlur = (field: keyof ProfileState, value: string | number | null) => {
    const prev = data?.profile ? (data.profile as Record<string, unknown>)[field] : undefined
    const same = prev === value || (prev == null && (value === '' || value === null))
    if (same) return
    save({ [field]: value })
  }

  if (loading) {
    return (
      <div className="page-header">
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading your profile...</p>
      </div>
    )
  }

  const displayName =
    (form.nickname && form.nickname.trim()) ||
    data?.profile?.full_name ||
    'You'
  const isComplete = (data?.profile_completion_percentage ?? 0) >= 100

  return (
    <div className="profile-page premium-page">
      <div className="page-header">
        <h2>Financial Identity</h2>
        <p>Your profile helps us give you smarter, more personal clarity.</p>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Section 1 — Identity Header */}
      <div className="premium-card" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>
              {displayName}
            </h3>
            <ClarityBadge
              level={data?.clarity_level ?? 1}
              showTagline={true}
              size="md"
            />
            <button
              type="button"
              onClick={() => save(form)}
              disabled={saving}
              style={{
                marginTop: 16,
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving...' : 'Improve My Clarity'}
            </button>
        </div>
      </div>

      {/* Section 2 — Financial Snapshot */}
      <div className="premium-card" style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
          Financial Snapshot
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Income Range</label>
            <select
              value={form.monthly_income_range}
              onChange={(e) =>
                setForm((f) => ({ ...f, monthly_income_range: e.target.value }))
              }
              onBlur={() =>
                handleBlur('monthly_income_range', form.monthly_income_range)
              }
              style={inputStyle}
            >
              {INCOME_RANGES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Primary Goal Category</label>
            <input
              type="text"
              value={form.primary_goal_category}
              onChange={(e) =>
                setForm((f) => ({ ...f, primary_goal_category: e.target.value }))
              }
              onBlur={() =>
                handleBlur('primary_goal_category', form.primary_goal_category)
              }
              placeholder="e.g. Emergency Fund, House"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Financial Stage</label>
            <select
              value={form.financial_stage}
              onChange={(e) =>
                setForm((f) => ({ ...f, financial_stage: e.target.value }))
              }
              onBlur={() => handleBlur('financial_stage', form.financial_stage)}
              style={inputStyle}
            >
              <option value="">Select</option>
              {FINANCIAL_STAGES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Risk Comfort</label>
            <select
              value={form.risk_comfort}
              onChange={(e) =>
                setForm((f) => ({ ...f, risk_comfort: e.target.value }))
              }
              onBlur={() => handleBlur('risk_comfort', form.risk_comfort)}
              style={inputStyle}
            >
              <option value="">Select</option>
              {RISK_COMFORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>
            Savings Confidence (1–5): {form.savings_confidence ?? '—'}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={form.savings_confidence ?? 3}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                savings_confidence: parseInt(e.target.value, 10),
              }))
            }
            onBlur={() =>
              handleBlur('savings_confidence', form.savings_confidence)
            }
            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            <span>Not confident</span>
            <span>Very confident</span>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Nickname (how we address you)</label>
          <input
            type="text"
            value={form.nickname}
            onChange={(e) =>
              setForm((f) => ({ ...f, nickname: e.target.value }))
            }
            onBlur={() => handleBlur('nickname', form.nickname)}
            placeholder="e.g. Jerald"
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Motivation</label>
          <select
            value={form.motivation_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, motivation_type: e.target.value }))
            }
            onBlur={() =>
              handleBlur('motivation_type', form.motivation_type)
            }
            style={inputStyle}
          >
            <option value="">Select</option>
            {MOTIVATION_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 3 — Dream Statement */}
      <div className="premium-card" style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>
          Why are you building this?
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
          A clear &quot;why&quot; keeps you going when things get busy.
        </p>
        <textarea
          value={form.dream_statement}
          onChange={(e) =>
            setForm((f) => ({ ...f, dream_statement: e.target.value }))
          }
          onBlur={() =>
            handleBlur('dream_statement', form.dream_statement)
          }
          placeholder="I want financial freedom so that..."
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: 100,
          }}
        />
      </div>

      {/* Section 4 — Action Engine */}
      <ProfileActionCTA isComplete={isComplete} />

      {/* Section 5 — Delete account (danger zone) */}
      <DeleteAccountSection />
    </div>
  )
}
