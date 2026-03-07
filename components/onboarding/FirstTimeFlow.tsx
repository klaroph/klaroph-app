'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { GOAL_PRESETS } from '@/lib/goalPresets'
import { markOnboardingSeen } from './HowKlaroPHWorksModal'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

const FIRST_TIME_STORAGE_KEY = 'klaroph_first_time_plan_done'

export function hasSeenFirstTimeOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return !!localStorage.getItem(FIRST_TIME_STORAGE_KEY)
}

export function markFirstTimeOnboardingSeen(): void {
  if (typeof window !== 'undefined') localStorage.setItem(FIRST_TIME_STORAGE_KEY, '1')
}

type IncomeFrequency = 'monthly' | 'semi-monthly' | 'weekly'

function toMonthlyAmount(amount: number, freq: IncomeFrequency): number {
  if (freq === 'monthly') return amount
  if (freq === 'semi-monthly') return amount * 2
  return amount * (52 / 12) // weekly → monthly
}

type FirstTimeFlowProps = {
  onComplete: () => void
}

export default function FirstTimeFlow({ onComplete }: FirstTimeFlowProps) {
  const [step, setStep] = useState(1)
  const [income, setIncome] = useState('')
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly')
  const [goalName, setGoalName] = useState('')
  const [goalPresetId, setGoalPresetId] = useState<string>('custom')
  const [targetAmount, setTargetAmount] = useState('')
  const [savingsPercent, setSavingsPercent] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incomeNum = parseFloat(income.replace(/[^0-9.]/g, '')) || 0
  const monthlyIncome = toMonthlyAmount(incomeNum, frequency)
  const savingsPerMonth = monthlyIncome * (savingsPercent / 100)
  const targetNum = parseFloat(targetAmount.replace(/[^0-9.]/g, '')) || 0
  const monthsToGoal =
    savingsPerMonth > 0 ? Math.ceil(targetNum / savingsPerMonth) : 0

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'var(--background)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 24,
    overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 16,
    border: '1px solid var(--border)',
    borderRadius: 12,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    marginTop: 8,
  }

  const handleGoToDashboard = async () => {
    setError(null)
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Session expired. Please log in again.')
        setLoading(false)
        return
      }
      const name = goalName.trim() || 'My Goal'
      const target = targetNum > 0 ? targetNum : 100000
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, target_amount: target }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 403) {
        setError(data?.error || 'Could not create goal.')
        setLoading(false)
        return
      }
      if (res.status === 403) {
        setError(data?.error || 'Goal limit reached.')
        setLoading(false)
        return
      }
      await supabase.from('profiles').update({
        monthly_income: monthlyIncome > 0 ? monthlyIncome : null,
        income_frequency: frequency,
        savings_percent: savingsPercent,
        onboarding_completed: true,
      }).eq('id', user.id)
      markFirstTimeOnboardingSeen()
      markOnboardingSeen()
      onComplete()
    } catch (e) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const formatPeso = (n: number) =>
    `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {step === 1 && (
          <>
            <div style={{ marginBottom: 8 }}>
              <KlaroPHHandLogo size={36} variant="onWhite" />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              🇵🇭 Financial clarity for every Filipino
            </p>
            <h1 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
              Make Your Money Clear.
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              We help Filipinos put savings first — before spending.
            </p>
            <p style={{ margin: '0 0 32px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Financial clarity doesn&apos;t require a big income. It starts with a clear plan.
            </p>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 2px 12px var(--color-primary-shadow)',
              }}
            >
              Start My Plan
            </button>
            <p style={{ margin: '24px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Takes less than 2 minutes.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              Let&apos;s start with your income.
            </h2>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Monthly Income</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="₱ 25,000"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 24 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Frequency</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}
                style={inputStyle}
              >
                <option value="monthly">Monthly</option>
                <option value="semi-monthly">Semi-Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {error && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null)
                if (!income.trim()) setError('Please enter a valid income amount.')
                else if (incomeNum <= 0) setError('Please enter a valid income amount.')
                else setStep(3)
              }}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Continue
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              What are you saving for?
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              {GOAL_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setGoalPresetId(p.id)
                    setGoalName(p.defaultName)
                  }}
                  style={{
                    padding: '10px 16px',
                    fontSize: 14,
                    border: goalPresetId === p.id ? '2px solid var(--color-primary)' : '1px solid var(--border)',
                    borderRadius: 10,
                    background: goalPresetId === p.id ? 'var(--color-blue-muted)' : 'var(--surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setGoalPresetId('custom'); setGoalName('') }}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  border: goalPresetId === 'custom' ? '2px solid var(--color-primary)' : '1px solid var(--border)',
                  borderRadius: 10,
                  background: goalPresetId === 'custom' ? 'var(--color-blue-muted)' : 'var(--surface)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Custom
              </button>
            </div>
            {goalPresetId === 'custom' && (
              <label style={{ display: 'block', textAlign: 'left', marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Goal name</span>
                <input
                  type="text"
                  placeholder="e.g. New laptop"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  style={inputStyle}
                />
              </label>
            )}
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 24 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Target Amount</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="₱ 100,000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                style={inputStyle}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setError(null)
                const t = parseFloat(targetAmount.replace(/[^0-9.]/g, ''))
                const name = goalPresetId === 'custom' ? goalName.trim() : (GOAL_PRESETS.find((p) => p.id === goalPresetId)?.defaultName ?? goalName)
                if (!name && goalPresetId === 'custom') setError('Please enter or select a goal.')
                else if (!targetAmount.trim() || t <= 0) setError('Please enter a valid target amount.')
                else {
                  setGoalName(name || goalName)
                  setStep(4)
                }
              }}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Continue
            </button>
            {error && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              Pay Your Future Self First.
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-secondary)' }}>
              How much will you save from every income?
            </p>
            <div style={{ marginBottom: 16 }}>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={savingsPercent}
                onChange={(e) => setSavingsPercent(Number(e.target.value))}
                style={{ width: '100%', height: 10, accentColor: 'var(--color-primary)' }}
              />
              <p style={{ margin: '12px 0 0', fontSize: 18, fontWeight: 600, color: 'var(--color-primary)' }}>
                {savingsPercent}%
              </p>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--text-secondary)' }}>
              You will save {formatPeso(savingsPerMonth)} per month.
            </p>
            <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Savings is not what&apos;s left. It comes first.
            </p>
            <button
              type="button"
              onClick={() => setStep(5)}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              See My Plan
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              Your Plan is Ready! 🎯
            </h2>
            <div
              style={{
                textAlign: 'left',
                padding: 20,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                marginBottom: 24,
              }}
            >
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>Income</p>
              <p style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>{formatPeso(monthlyIncome)}/month</p>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>Monthly Savings</p>
              <p style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>{formatPeso(savingsPerMonth)}</p>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>Goal</p>
              <p style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>{goalName.trim() || 'My Goal'}</p>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>Target</p>
              <p style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>{formatPeso(targetNum)}</p>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>Projected Completion</p>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                {monthsToGoal > 0
                  ? `~${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}`
                  : '—'}
              </p>
            </div>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-secondary)' }}>
              {monthsToGoal > 0
                ? `You can reach your goal in ${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}.`
                : 'Adjust your savings % or target to see your timeline.'}
            </p>
            {error && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>
            )}
            <button
              type="button"
              onClick={handleGoToDashboard}
              disabled={loading}
              style={{
                padding: '14px 28px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? 'Setting up...' : 'Go to Dashboard'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
