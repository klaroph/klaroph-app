'use client'

import { useState } from 'react'
import { formatWholePeso } from '@/lib/format'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GOAL_PRESETS } from '@/lib/goalPresets'
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_REQUIRED_ERROR,
  NICKNAME_TOO_LONG_ERROR,
  nicknameForWrite,
  onboardingNamePrefill,
} from '@/lib/displayName'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'
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

// Welcome is step 1 of 4. The label is "Step n of 4" on every screen, including
// welcome, so the number always matches the screen the person is on.
const STEPS = 4

const STEP_LABELS: Record<number, string> = {
  1: 'Welcome',
  2: 'Income',
  3: 'Spending plan',
  4: 'Your plan',
}

const SETUP_PREVIEW = ['Your income', 'A simple spending plan', 'Your first goal', 'A savings preference']

function PreferredNameField({
  value,
  message,
  onChange,
}: {
  value: string
  message: string | null
  onChange: (value: string) => void
}) {
  return (
    <label className="onb-field">
      <span className="onb-label">What should we call you?</span>
      <input
        type="text"
        name="nickname"
        autoComplete="nickname"
        required
        maxLength={NICKNAME_MAX_LENGTH}
        value={value}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? 'onb-nickname-error' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="login-input"
      />
      {message ? (
        <p id="onb-nickname-error" className="onb-error" role="alert">
          {message}
        </p>
      ) : null}
    </label>
  )
}

type OnboardingFlowProps = {
  nickname?: string | null
  fullName?: string | null
  /** Test hook so a later step can render without clicking through. */
  initialStep?: number
}

export default function OnboardingFlow({
  nickname = null,
  fullName = null,
  initialStep = 1,
}: OnboardingFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const seededName = onboardingNamePrefill({ nickname, fullName })
  const seededNameProblem = initialStep === STEPS ? nicknameForWrite(seededName) : null
  const [income, setIncome] = useState('')
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly')
  const [goalName, setGoalName] = useState('')
  const [goalPresetId, setGoalPresetId] = useState<string>('custom')
  const [targetAmount, setTargetAmount] = useState('')
  const [savingsPercent, setSavingsPercent] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferredName, setPreferredName] = useState(seededName)
  const [nameError, setNameError] = useState<string | null>(
    seededNameProblem && !seededNameProblem.ok ? seededNameProblem.error : null,
  )
  const [finishNameOpen, setFinishNameOpen] = useState(
    initialStep === STEPS && !!seededNameProblem && !seededNameProblem.ok,
  )

  const incomeNum = parseFloat(income.replace(/[^0-9.]/g, '')) || 0
  const monthlyIncome = toMonthlyAmount(incomeNum, frequency)
  const savingsPerMonth = monthlyIncome * (savingsPercent / 100)
  const targetNum = parseFloat(targetAmount.replace(/[^0-9.]/g, '')) || 0
  const monthsToGoal =
    savingsPerMonth > 0 ? Math.ceil(targetNum / savingsPerMonth) : 0

  const editPreferredName = (value: string) => {
    setPreferredName(value)
    if (!nameError && !finishNameOpen) return
    const parsed = nicknameForWrite(value)
    setNameError(parsed.ok ? null : parsed.error)
  }

  const rejectIncompleteName = (atFinish: boolean) => {
    const parsed = nicknameForWrite(preferredName)
    if (parsed.ok) {
      setNameError(null)
      setPreferredName(parsed.nickname)
      return parsed
    }
    if (atFinish) setFinishNameOpen(true)
    setNameError(parsed.error)
    return parsed
  }

  const startPlan = () => {
    const parsed = rejectIncompleteName(false)
    if (!parsed.ok) return
    setStep(2)
  }

  const handleFinish = async () => {
    setError(null)
    const parsed = rejectIncompleteName(true)
    if (!parsed.ok) return
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
          pay_period_income: incomeNum,
          income_frequency: frequency,
          primary_goal_category,
          savings_percent: savingsPercent,
          goal_name: name,
          goal_target_amount: target,
          nickname: parsed.nickname,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const serverError = (data?.error as string) || 'Something went wrong.'
        if (serverError === NICKNAME_REQUIRED_ERROR || serverError === NICKNAME_TOO_LONG_ERROR) {
          setFinishNameOpen(true)
          setNameError(serverError)
        } else {
          setError(serverError)
        }
        setLoading(false)
        return
      }
      router.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const finishPlan = () => {
    setError(null)
    const name =
      goalPresetId === 'custom'
        ? goalName.trim()
        : (GOAL_PRESETS.find((p) => p.id === goalPresetId)?.defaultName ?? goalName)
    const t = parseFloat(targetAmount.replace(/[^0-9.]/g, ''))
    if (!name && goalPresetId === 'custom') {
      setError('Please enter or select a goal.')
      return
    }
    if (!targetAmount.trim() || t <= 0) {
      setError('Please enter a valid target amount.')
      return
    }
    void handleFinish()
  }

  const goNext = () => {
    setError(null)
    if (step === 2 && (!income.trim() || incomeNum <= 0)) {
      setError('Please enter a valid income amount.')
      return
    }
    if (step < STEPS) setStep((s) => s + 1)
  }

  const goBack = () => {
    setError(null)
    if (step > 1) setStep((s) => s - 1)
  }

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
          <div className="onb-progress">
            <p className="onb-progress-label">
              Step {step} of {STEPS} · <span>{STEP_LABELS[step]}</span>
            </p>
            <div
              className="onb-progress-track"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={1}
              aria-valuemax={STEPS}
              aria-valuenow={step}
            >
              <div className="onb-progress-fill" style={{ width: `${(step / STEPS) * 100}%` }} />
            </div>
          </div>

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
              <PreferredNameField
                value={preferredName}
                message={nameError}
                onChange={editPreferredName}
              />
              <button type="button" onClick={startPlan} className="btn-primary onb-btn onb-btn--wide">
                Start My Plan
              </button>
              <p className="onb-hint">Takes less than 2 minutes. You can change everything later.</p>
            </div>
          )}

          {/* Step 2: Income and savings percent */}
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
              <div className="onb-follow">
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
                  Suggested savings: <strong>{formatWholePeso(savingsPerMonth)}</strong> per month.
                </p>
                <p className="onb-hint">
                  Savings is not what&apos;s left — it comes first. This {savingsPercent}% stays a preference
                  on your profile. Nothing moves to your goal until you allocate it.
                </p>
              </div>
              {errorLine}
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={goNext} className="btn-primary onb-btn">
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 3: Budget (Spending Plan). Skip advances without writing budget_plans. */}
          {step === 3 && <BudgetStep onBack={goBack} onNext={goNext} />}

          {/* Step 4: Goal and plan summary */}
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
              <div className="onb-follow">
                <h2 className="onb-title">Your plan is ready! 🎯</h2>
                <p className="onb-lead">
                  {monthsToGoal > 0
                    ? `If you later allocate ${savingsPercent}% of your income, you could reach your goal in about ${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}.`
                    : 'Adjust your savings % or target to see a timeline.'}
                </p>
                <dl className="onb-summary">
                  <div>
                    <dt>This pay period</dt>
                    <dd>{formatWholePeso(incomeNum)}</dd>
                  </div>
                  <div>
                    <dt>Income</dt>
                    <dd>{formatWholePeso(monthlyIncome)} a month</dd>
                  </div>
                  <div>
                    <dt>Savings preference</dt>
                    <dd>{savingsPercent}% · {formatWholePeso(savingsPerMonth)} a month</dd>
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
                    <dt>If you allocate later</dt>
                    <dd>{monthsToGoal > 0 ? `~${monthsToGoal} month${monthsToGoal !== 1 ? 's' : ''}` : '—'}</dd>
                  </div>
                </dl>
                <p className="onb-hint">
                  We&apos;ll save this pay period&apos;s income today. Nothing moves to your goal until you
                  allocate it later — your savings % stays a preference only.
                </p>
              </div>
              {(finishNameOpen || nameError) && (
                <PreferredNameField
                  value={preferredName}
                  message={nameError}
                  onChange={editPreferredName}
                />
              )}
              {errorLine}
              <div className="onb-actions">
                {backButton}
                <button type="button" onClick={finishPlan} disabled={loading} className="btn-primary onb-btn">
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
