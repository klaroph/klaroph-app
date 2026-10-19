import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NICKNAME_MAX_LENGTH, NICKNAME_REQUIRED_ERROR, NICKNAME_TOO_LONG_ERROR } from '@/lib/displayName'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}))

import OnboardingFlow from './OnboardingFlow'

const flowSource = readFileSync(path.join(process.cwd(), 'app/onboarding/OnboardingFlow.tsx'), 'utf8')

describe('Onboarding welcome name', () => {
  it('puts a truncated pre-fill in the field so the value is never over 15', () => {
    const christopher = renderToStaticMarkup(<OnboardingFlow fullName="Christopher Santos" />)
    expect(christopher).toContain('value="Christopher"')
    expect(christopher).toContain(`maxLength="${NICKNAME_MAX_LENGTH}"`)
    expect(christopher).toContain('required')
    expect(christopher).not.toContain('placeholder="Optional"')
    expect(christopher).not.toContain(NICKNAME_REQUIRED_ERROR)

    const long = renderToStaticMarkup(<OnboardingFlow nickname="Christopher John" />)
    expect(long).toContain('value="Christopher Joh"')
    expect(long).not.toContain('value="Christopher John"')
    expect(long).not.toContain(NICKNAME_TOO_LONG_ERROR)
  })

  it('asks for a name before leaving welcome and again before finish', () => {
    expect(flowSource).toContain('onClick={startPlan}')
    expect(flowSource).toContain('rejectIncompleteName(false)')
    expect(flowSource).toContain('rejectIncompleteName(true)')
    expect(flowSource).toContain('if (!parsed.ok) return')
    expect(flowSource).toContain('nickname: parsed.nickname')
    expect(flowSource).not.toContain('.slice(')
  })

  it('shows the name and an inline message on Finish when the old screen left it blank', () => {
    const html = renderToStaticMarkup(
      <OnboardingFlow initialStep={4} fullName="ada@example.com" />,
    )
    expect(html).toContain('Step 4 of 4')
    expect(html).toContain(NICKNAME_REQUIRED_ERROR)
    expect(html).toContain('name="nickname"')
    expect(html).toContain('What should we call you?')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Go to Dashboard')
    expect(html).toContain(`maxLength="${NICKNAME_MAX_LENGTH}"`)
  })

  it('does not block Finish when the pre-fill is already a valid name', () => {
    const html = renderToStaticMarkup(
      <OnboardingFlow initialStep={4} fullName="Christopher Santos" />,
    )
    expect(html).toContain('Go to Dashboard')
    expect(html).not.toContain(NICKNAME_REQUIRED_ERROR)
    expect(html).not.toContain('name="nickname"')
  })
})

describe('Onboarding four-step flow', () => {
  it('counts welcome as step 1 and labels every screen Step n of 4', () => {
    const welcome = renderToStaticMarkup(<OnboardingFlow fullName="Ana Cruz" />)
    expect(welcome).toContain('Step 1 of 4')
    expect(welcome).toContain('Welcome')
    expect(welcome).toContain('aria-valuenow="1"')
    expect(welcome).toContain('aria-valuemax="4"')
    expect(welcome).not.toContain('>Back<')

    const income = renderToStaticMarkup(<OnboardingFlow initialStep={2} nickname="Ana" />)
    expect(income).toContain('Step 2 of 4')
    expect(income).toContain('>Income<')
    expect(income).toContain('Income amount')
    expect(income).toContain('Semi-Monthly')
    expect(income).toContain('Weekly')
    expect(income).toContain('aria-label="Savings percentage"')
    expect(income).toContain('min="5"')
    expect(income).toContain('max="50"')
    expect(income).toContain('value="20"')
    expect(income).toContain('Suggested savings:')
    expect(income).toContain('>Back<')

    const budget = renderToStaticMarkup(<OnboardingFlow initialStep={3} nickname="Ana" />)
    expect(budget).toContain('Step 3 of 4')
    expect(budget).toContain('Spending plan')
    expect(budget).toContain('>Back<')
    expect(budget).toContain('Skip for now')

    const plan = renderToStaticMarkup(<OnboardingFlow initialStep={4} nickname="Ana" />)
    expect(plan).toContain('Step 4 of 4')
    expect(plan).toContain('Your plan')
    expect(plan).toContain('What are you saving for?')
    expect(plan).toContain('Your plan is ready')
    expect(plan).toContain('This pay period')
    expect(plan).toContain('Go to Dashboard')
    expect(plan).toContain('>Back<')
  })

  it('goes back by changing the step only, so entered answers stay', () => {
    expect(flowSource).toMatch(
      /const goBack = \(\) => \{\n\s*setError\(null\)\n\s*if \(step > 1\) setStep\(\(s\) => s - 1\)\n\s*\}/,
    )
    expect(flowSource).not.toContain('setIncome(\'\')')
    expect(flowSource).not.toContain('setSavingsPercent(20)')
    expect(flowSource).not.toContain('setTargetAmount(\'\')')
  })

  it('lets Skip leave the spending plan without touching budget rows', () => {
    const budgetSource = readFileSync(
      path.join(process.cwd(), 'components/onboarding/BudgetStep.tsx'),
      'utf8',
    )
    const skipAt = budgetSource.indexOf('Skip for now')
    expect(skipAt).toBeGreaterThan(0)
    const skipButton = budgetSource.slice(skipAt - 180, skipAt)
    expect(skipButton).toContain('onClick={onNext}')
    expect(skipButton).not.toContain('fetch')
    expect(budgetSource).not.toContain('budget_plans')
    expect(budgetSource).not.toContain('.delete(')
  })

  it('omits stage, confidence, risk, motivation, dream, and income range from the finish body', () => {
    const bodyStart = flowSource.indexOf('body: JSON.stringify({')
    const bodyEnd = flowSource.indexOf('}),', bodyStart)
    const body = flowSource.slice(bodyStart, bodyEnd)
    expect(bodyStart).toBeGreaterThan(0)
    expect(body).toContain('monthly_income:')
    expect(body).toContain('pay_period_income: incomeNum')
    expect(body).toContain('income_frequency: frequency')
    expect(body).toContain('savings_percent: savingsPercent')
    expect(body).toContain('goal_name: name')
    expect(body).toContain('goal_target_amount: target')
    expect(body).toContain('nickname: parsed.nickname')
    for (const key of [
      'monthly_income_range',
      'savings_confidence',
      'financial_stage',
      'risk_comfort',
      'motivation_type',
      'dream_statement',
    ]) {
      expect(body).not.toContain(key)
      expect(flowSource).not.toContain(key)
    }
    expect(flowSource).toContain('rejectIncompleteName(true)')
    expect(flowSource).toContain('if (!parsed.ok) return')
    expect(flowSource).toContain('Go to Dashboard')
  })
})
