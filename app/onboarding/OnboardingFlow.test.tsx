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
      <OnboardingFlow initialStep={8} fullName="ada@example.com" />,
    )
    expect(html).toContain(NICKNAME_REQUIRED_ERROR)
    expect(html).toContain('name="nickname"')
    expect(html).toContain('What should we call you?')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Go to Dashboard')
    expect(html).toContain(`maxLength="${NICKNAME_MAX_LENGTH}"`)
  })

  it('does not block Finish when the pre-fill is already a valid name', () => {
    const html = renderToStaticMarkup(
      <OnboardingFlow initialStep={8} fullName="Christopher Santos" />,
    )
    expect(html).toContain('Go to Dashboard')
    expect(html).not.toContain(NICKNAME_REQUIRED_ERROR)
    expect(html).not.toContain('name="nickname"')
  })
})
