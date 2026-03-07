'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GOAL_PRESETS } from '@/lib/goalPresets'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'
import {
  FINANCIAL_STAGES,
  RISK_COMFORT_OPTIONS,
  MOTIVATION_TYPES,
} from '@/types/profile'
import BudgetStep from '@/components/onboarding/BudgetStep'

type IncomeFrequency = 'monthly' | 'semi-monthly' | 'weekly'

function toMonthlyAmount(amount: number, freq: IncomeFrequency): number {
  if (freq === 'monthly') return amount
  if (freq === 'semi-monthly') return amount * 2
  return amount * (52 / 12)
}

/** Map goal preset id to API primary_goal_category */
function presetToGoalCategory(presetId: string): string | null {
  const map: Record<string, string> = {
    emergency: 'emergency_fund',
    house: 'house',
    education: 'education',
    travel: 'travel',
    business: 'other',
    custom: 'other',
  }
  return map[presetId] ?? 'other'
}

const STEPS = 8

export default function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [income, setIncome] = useState('')
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly')
  const [goalName, setGoalName] = useState('')
  const [goalPresetId, setGoalPresetId] = useState<string>('custom')
  const [targetAmount, setTargetAmount] = useState('')
  const [savingsPercent, setSavingsPercent] = useState(20)
  const [savingsConfidence, setSavingsConfidence] = useState(3)
  const [financialStage, setFinancialStage] = useState('')
  const [riskComfort, setRiskComfort] = useState('')
  const [motivationType, setMotivationType] = useState('')
  const [dreamStatement, setDreamStatement] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incomeNum = parseFloat(income.replace(/[^0-9.]/g, '')) || 0
  const monthlyIncome = toMonthlyAmount(incomeNum, frequency)
  const savingsPerMonth = monthlyIncome * (savingsPercent / 100)
  const targetNum = parseFloat(targetAmount.replace(/[^0-9.]/g, '')) || 0
  const monthsToGoal =
    savingsPerMonth > 0 ? Math.ceil(targetNum / savingsPerMonth) : 0

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: 'var(--background)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
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

  const buttonPrimaryStyle: React.CSSProperties = {
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
  }

  const handleFinish = async () => {
    setError(null)
    setLoading(true)
    const name = goalName.trim() || 'My Goal'
    const target = targetNum > 0 ? targetNum : 100000
    const primary_goal_category = presetToGoalCategory(goalPresetId)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          monthly_income: monthlyIncome > 0 ? monthlyIncome : null,
          income_frequency: frequency,
          primary_goal_category,
          savings_percent: savingsPercent,
          savings_confidence: savingsConfidence,
          financial_stage: financialStage || null,
          risk_comfort: riskComfort || null,
          motivation_type: motivationType || null,
          dream_statement: dreamStatement.trim() || null,
          goal_name: name,
          goal_target_amount: target,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data?.error as string) || 'Something went wrong.')
        setLoading(false)
        return
      }
      router.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const goNext = () => {
    setError(null)
    if (step === 2 && (!income.trim() || incomeNum <= 0)) {
      setError('Please enter a valid income amount.')
      return
    }
    if (step === 4) {
      const name = goalPresetId === 'custom' ? goalName.trim() : (GOAL_PRESETS.find((p) => p.id === goalPresetId)?.defaultName ?? goalName)
      const t = parseFloat(targetAmount.replace(/[^0-9.]/g, ''))
      if (!name && goalPresetId === 'custom') {
        setError('Please enter or select a goal.')
        return
      }
      if (!targetAmount.trim() || t <= 0) {
        setError('Please enter a valid target amount.')
        return
      }
    }
    if (step < STEPS) setStep((s) => s + 1)
    else handleFinish()
  }

  const goBack = () => {
    setError(null)
    if (step > 1) setStep((s) => s - 1)
  }

  const formatPeso = (n: number) =>
    `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

  return (
    <div style={containerStyle}>
      {step > 1 && step < STEPS && (
        <header style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <KlaroPHHandLogo size={32} variant="onWhite" />
          </Link>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Step {step - 1} of {STEPS - 1}
          </p>
        </header>
      )}
      <div style={cardStyle}>
        {/* Step 1: Intro */}
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
            <button type="button" onClick={() => setStep(2)} style={buttonPrimaryStyle}>
              Start My Plan
            </button>
            <p style={{ margin: '24px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Takes less than 2 minutes.
            </p>
          </>
        )}

        {/* Step 2: Income */}
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
            {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={goBack} style={{ ...buttonPrimaryStyle, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button type="button" onClick={goNext} style={buttonPrimaryStyle}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 4: Goal */}
        {step === 4 && (
          <>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              What are you saving for?
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              {GOAL_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setGoalPresetId(p.id); setGoalName(p.defaultName) }}
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
                <input type="text" placeholder="e.g. New laptop" value={goalName} onChange={(e) => setGoalName(e.target.value)} style={inputStyle} />
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
            {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={goBack} style={{ ...buttonPrimaryStyle, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button type="button" onClick={goNext} style={buttonPrimaryStyle}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 3: Budget (Spending Plan) */}
        {step === 3 && (
          <BudgetStep
            inputStyle={inputStyle}
            buttonPrimaryStyle={buttonPrimaryStyle}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {/* Step 4: Savings % */}
        {step === 5 && (
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
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={goBack} style={{ ...buttonPrimaryStyle, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button type="button" onClick={() => setStep(6)} style={buttonPrimaryStyle}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 6: Profile — financial stage & savings confidence */}
        {step === 6 && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              A bit about your financial journey.
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)' }}>
              You can edit these later in your profile.
            </p>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Where are you now?</span>
              <select value={financialStage} onChange={(e) => setFinancialStage(e.target.value)} style={inputStyle}>
                <option value="">Select</option>
                {FINANCIAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 24 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>How confident are you about saving? (1–5)</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSavingsConfidence(n)}
                    style={{
                      padding: '10px 16px',
                      fontSize: 16,
                      border: savingsConfidence === n ? '2px solid var(--color-primary)' : '1px solid var(--border)',
                      borderRadius: 10,
                      background: savingsConfidence === n ? 'var(--color-blue-muted)' : 'var(--surface)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={goBack} style={{ ...buttonPrimaryStyle, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button type="button" onClick={() => setStep(7)} style={buttonPrimaryStyle}>
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 7: Profile — risk comfort, motivation, dream */}
        {step === 7 && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              What matters most to you?
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)' }}>
              You can edit these later in your profile.
            </p>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Risk comfort</span>
              <select value={riskComfort} onChange={(e) => setRiskComfort(e.target.value)} style={inputStyle}>
                <option value="">Select</option>
                {RISK_COMFORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>What motivates you?</span>
              <select value={motivationType} onChange={(e) => setMotivationType(e.target.value)} style={inputStyle}>
                <option value="">Select</option>
                {MOTIVATION_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: 24 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Dream or goal in one sentence (optional)</span>
              <input
                type="text"
                placeholder="e.g. Own a home by 35"
                value={dreamStatement}
                onChange={(e) => setDreamStatement(e.target.value)}
                style={inputStyle}
              />
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={goBack} style={{ ...buttonPrimaryStyle, backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Back
              </button>
              <button type="button" onClick={() => setStep(8)} style={buttonPrimaryStyle}>
                See My Plan
              </button>
            </div>
          </>
        )}

        {/* Step 8: Summary */}
        {step === 8 && (
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
                {monthsToGoal > 0 ? `~${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}` : '—'}
              </p>
            </div>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-secondary)' }}>
              {monthsToGoal > 0
                ? `You can reach your goal in ${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}.`
                : 'Adjust your savings % or target to see your timeline.'}
            </p>
            {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
            <button
              type="button"
              onClick={handleFinish}
              disabled={loading}
              style={{ ...buttonPrimaryStyle, opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Setting up...' : 'Go to Dashboard'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
