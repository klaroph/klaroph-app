'use client'

import { useState } from 'react'
import { formatWholePeso } from '@/lib/format'
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

/** Labels for steps 2–8 (step 1 is the welcome screen). */
const STEP_LABELS: Record<number, string> = {
  2: 'Income',
  3: 'Spending plan',
  4: 'Goal',
  5: 'Savings',
  6: 'Your journey',
  7: 'What matters',
  8: 'Your plan',
}

const SETUP_PREVIEW = ['Your income', 'A simple spending plan', 'Your first goal', 'How much to save first']

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

  const progressStep = step - 1
  const progressTotal = STEPS - 1

  const errorLine = error ? (
    <p className="onb-error" role="alert">
      {error}
    </p>
  ) : null

  const backButton = (
    <button type="button" onClick={goBack} className="btn-secondary onb-btn">
      Back
    </button>
  )

  return (
    <div className="onb">
      <header className="onb-header">
        <Link href="/" className="onb-logo" aria-label="KlaroPH home">
          <KlaroPHHandLogo size={32} variant="onWhite" />
        </Link>
      </header>

      <main className="onb-main">
        <div className="onb-card">
          {step > 1 && (
            <div className="onb-progress">
              <p className="onb-progress-label">
                Step {progressStep} of {progressTotal} · <span>{STEP_LABELS[step]}</span>
              </p>
              <div
                className="onb-progress-track"
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={1}
                aria-valuemax={progressTotal}
                aria-valuenow={progressStep}
              >
                <div className="onb-progress-fill" style={{ width: `${(progressStep / progressTotal) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="onb-welcome">
              <KlaroPHHandLogo size={44} variant="onWhite" />
              <p className="onb-eyebrow">🇵🇭 Financial clarity for every Filipino</p>
              <h1 className="onb-title onb-title--lg">Let&apos;s make your money a little clearer.</h1>
              <p className="onb-lead">
                We help Filipinos put savings first — before spending. Financial clarity doesn&apos;t
                require a big income. It starts with a clear plan.
              </p>
              <div className="onb-preview">
                <p className="onb-preview-title">We&apos;ll set up</p>
                <ul>
                  {SETUP_PREVIEW.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <button type="button" onClick={() => setStep(2)} className="btn-primary onb-btn onb-btn--wide">
                Start My Plan
              </button>
              <p className="onb-hint">Takes less than 2 minutes. You can change everything later.</p>
            </div>
          )}

          {/* Step 2: Income */}
          {step === 2 && (
            <>
              <h2 className="onb-title">Let&apos;s start with your income.</h2>
              <p className="onb-lead">This helps KlaroPH size your spending plan and savings.</p>
              <label className="onb-field">
                <span className="onb-label">Income amount</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="₱ 25,000"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  className="login-input"
                />
              </label>
              <label className="onb-field">
                <span className="onb-label">How often you get paid</span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}
                  className="login-input"
                >
                  <option value="monthly">Monthly</option>
                  <option value="semi-monthly">Semi-Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              {errorLine}
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={goNext} className="btn-primary onb-btn">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 3: Budget (Spending Plan) */}
          {step === 3 && <BudgetStep onBack={goBack} onNext={goNext} />}

          {/* Step 4: Goal */}
          {step === 4 && (
            <>
              <h2 className="onb-title">What are you saving for?</h2>
              <p className="onb-lead">Pick one to start. You can add more goals later.</p>
              <div className="onb-chips" role="group" aria-label="Goal type">
                {GOAL_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={goalPresetId === p.id}
                    className="onb-chip"
                    onClick={() => { setGoalPresetId(p.id); setGoalName(p.defaultName) }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={goalPresetId === 'custom'}
                  className="onb-chip"
                  onClick={() => { setGoalPresetId('custom'); setGoalName('') }}
                >
                  Custom
                </button>
              </div>
              {goalPresetId === 'custom' && (
                <label className="onb-field">
                  <span className="onb-label">Goal name</span>
                  <input type="text" placeholder="e.g. New laptop" value={goalName} onChange={(e) => setGoalName(e.target.value)} className="login-input" />
                </label>
              )}
              <label className="onb-field">
                <span className="onb-label">Target amount</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="₱ 100,000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="login-input"
                />
              </label>
              {errorLine}
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={goNext} className="btn-primary onb-btn">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 5: Savings % */}
          {step === 5 && (
            <>
              <h2 className="onb-title">Pay your future self first.</h2>
              <p className="onb-lead">How much will you save from every income?</p>
              <div className="onb-range">
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={savingsPercent}
                  onChange={(e) => setSavingsPercent(Number(e.target.value))}
                  aria-label="Savings percentage"
                />
                <p className="onb-range-value">{savingsPercent}%</p>
              </div>
              <p className="onb-callout">
                You will save <strong>{formatWholePeso(savingsPerMonth)}</strong> per month.
              </p>
              <p className="onb-hint">Savings is not what&apos;s left. It comes first.</p>
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={() => setStep(6)} className="btn-primary onb-btn">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 6: Profile — financial stage & savings confidence */}
          {step === 6 && (
            <>
              <h2 className="onb-title">A bit about your financial journey.</h2>
              <p className="onb-lead">Optional — you can edit these later in your profile.</p>
              <label className="onb-field">
                <span className="onb-label">Where are you now?</span>
                <select value={financialStage} onChange={(e) => setFinancialStage(e.target.value)} className="login-input">
                  <option value="">Select</option>
                  {FINANCIAL_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <div className="onb-field">
                <span className="onb-label" id="onb-confidence-label">How confident are you about saving? (1–5)</span>
                <div className="onb-chips onb-chips--start" role="group" aria-labelledby="onb-confidence-label">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={savingsConfidence === n}
                      className="onb-chip onb-chip--square"
                      onClick={() => setSavingsConfidence(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={() => setStep(7)} className="btn-primary onb-btn">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 7: Profile — risk comfort, motivation, dream */}
          {step === 7 && (
            <>
              <h2 className="onb-title">What matters most to you?</h2>
              <p className="onb-lead">Optional — you can edit these later in your profile.</p>
              <label className="onb-field">
                <span className="onb-label">Risk comfort</span>
                <select value={riskComfort} onChange={(e) => setRiskComfort(e.target.value)} className="login-input">
                  <option value="">Select</option>
                  {RISK_COMFORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="onb-field">
                <span className="onb-label">What motivates you?</span>
                <select value={motivationType} onChange={(e) => setMotivationType(e.target.value)} className="login-input">
                  <option value="">Select</option>
                  {MOTIVATION_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="onb-field">
                <span className="onb-label">Dream or goal in one sentence (optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Own a home by 35"
                  value={dreamStatement}
                  onChange={(e) => setDreamStatement(e.target.value)}
                  className="login-input"
                />
              </label>
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={() => setStep(8)} className="btn-primary onb-btn">
                  See My Plan
                </button>
              </div>
            </>
          )}

          {/* Step 8: Summary — first value moment from the user's own entries */}
          {step === 8 && (
            <>
              <h2 className="onb-title">Your plan is ready! 🎯</h2>
              <p className="onb-lead">
                {monthsToGoal > 0
                  ? `You can reach your goal in ${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}.`
                  : 'Adjust your savings % or target to see your timeline.'}
              </p>
              <dl className="onb-summary">
                <div>
                  <dt>Income</dt>
                  <dd>{formatWholePeso(monthlyIncome)}/month</dd>
                </div>
                <div>
                  <dt>Monthly savings</dt>
                  <dd>{formatWholePeso(savingsPerMonth)}</dd>
                </div>
                <div>
                  <dt>Goal</dt>
                  <dd>{goalName.trim() || 'My Goal'}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{formatWholePeso(targetNum)}</dd>
                </div>
                <div className="onb-summary-wide">
                  <dt>Projected completion</dt>
                  <dd>{monthsToGoal > 0 ? `~${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}` : '—'}</dd>
                </div>
              </dl>
              <p className="onb-hint">
                Next: your dashboard, where you can add expenses, track your goal, and ask Klaro about
                your numbers.
              </p>
              {errorLine}
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={handleFinish} disabled={loading} className="btn-primary onb-btn">
                  {loading ? 'Setting up…' : 'Go to Dashboard'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
