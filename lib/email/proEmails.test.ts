import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { PRO_PLAN_FEATURES } from '@/lib/planFeatures'
import { PRO_ONE_TIME_LINE } from '@/lib/planPricing'
import { extractPaidAmount, renderComplimentaryProEmail, renderPaidProEmail, type PaidProEmailInput } from './proEmails'

const paid = (overrides: Partial<PaidProEmailInput> = {}) =>
  renderPaidProEmail({
    firstName: 'Juan',
    planType: 'monthly',
    isLifetime: false,
    activeUntil: '2026-10-26T04:00:00.000Z',
    amountPaid: { centavos: 143_040, currency: 'PHP' },
    ...overrides,
  })

const PRO_ONLY = PRO_PLAN_FEATURES.filter((f) => f.premium).map((f) => f.label)
const FORBIDDEN = /\/month|\/year|\brenew|\blifetime\b/i

describe('renderPaidProEmail', () => {
  it('renders the V2 shell with the real amount and the one-time line', () => {
    const { subject, html, text } = paid({ isLifetime: true })
    expect(subject).toBe('You’re officially KlaroPH Pro')
    expect(html).toContain('logo-klaroph-blue.png')
    expect(html).toContain('https://klaroph.com/dashboard')
    expect(html).toContain('Open KlaroPH →')
    expect(text).toContain('Hi Juan,')
    expect(text).toContain('Plan: KlaroPH Pro')
    expect(text).toContain('Amount paid: ₱1,430.40')
    expect(text).toContain(PRO_ONE_TIME_LINE)
    expect(text).not.toContain('Active until')
    expect(`${text}\n${html}`).not.toMatch(FORBIDDEN)
  })

  it('does not label the purchase monthly or annual', () => {
    for (const planType of ['monthly', 'annual'] as const) {
      const { text, html } = paid({ planType, isLifetime: true })
      expect(text).toContain('Plan: KlaroPH Pro')
      expect(text).not.toMatch(/Plan: KlaroPH Pro ·/)
      expect(`${text}\n${html}`).not.toMatch(FORBIDDEN)
    }
  })

  it('omits facts it does not have instead of inventing them', () => {
    const { text } = paid({ isLifetime: true, amountPaid: null, activeUntil: null })
    expect(text).not.toMatch(/Amount paid|Active until/)
    expect(text).toContain(PRO_ONE_TIME_LINE)
    expect(text).not.toMatch(/₱/)
  })

  it('keeps an end date only for a time-limited paid row', () => {
    const { text, html } = paid({ isLifetime: false, activeUntil: '2027-03-08T17:30:00.000Z' })
    expect(text).toContain('Plan: KlaroPH Pro')
    expect(text).toContain('Active until: March 9, 2027')
    expect(text).toContain('Nothing else will be charged.')
    expect(text).not.toContain(PRO_ONE_TIME_LINE)
    expect(`${text}\n${html}`).not.toMatch(FORBIDDEN)
  })

  it('lists the canonical Pro features', () => {
    const { text } = paid()
    for (const feature of PRO_ONLY) expect(text).toContain(`- ${feature}`)
    expect(text).not.toContain('Export CSV')
  })
})

describe('renderComplimentaryProEmail', () => {
  it('states the real end date and that nothing is charged', () => {
    const { subject, text } = renderComplimentaryProEmail({ firstName: 'Juan', validUntil: '2026-12-26T04:00:00.000Z' })
    expect(subject).toBe('You’ve got KlaroPH Pro — on us')
    expect(text).toContain('Hi Juan,')
    expect(text).toContain('Plan: KlaroPH Pro · Complimentary')
    expect(text).toContain('Active until: December 26, 2026')
    expect(text).toContain('This complimentary access ends on the date above. Nothing will be charged.')
    for (const feature of PRO_ONLY) expect(text).toContain(`- ${feature}`)
  })

  it('has no payment, renewal, lifetime, marketing or founder language', () => {
    const { html, text } = renderComplimentaryProEmail({ firstName: null, validUntil: '2026-12-26T04:00:00.000Z' })
    expect(text).toContain('Hi there,')
    for (const body of [html, text]) {
      expect(body).not.toMatch(/Amount paid|₱|lifetime|unsubscribe|utm_|founder|admin/i)
      expect(body).not.toMatch(FORBIDDEN)
    }
  })

  it('refuses to render without a real end date', () => {
    expect(() => renderComplimentaryProEmail({ firstName: null, validUntil: 'not a date' })).toThrow()
  })

  it('escapes names in HTML', () => {
    const { html } = renderComplimentaryProEmail({ firstName: '<b>Jo</b>', validUntil: '2026-12-26T04:00:00.000Z' })
    expect(html).toContain('Hi &lt;b&gt;Jo&lt;/b&gt;,')
  })
})

describe('test mode', () => {
  it('adds the [TEST] subject and sample notice only when asked', () => {
    const live = paid()
    const sample = paid({ testMode: true })
    expect(live.subject).not.toContain('[TEST]')
    expect(live.text).not.toMatch(/sample email/i)
    expect(sample.subject).toBe('[TEST] You’re officially KlaroPH Pro')
    expect(sample.text).toContain('No payment was made and no account was changed.')

    const comp = renderComplimentaryProEmail({ firstName: null, validUntil: '2026-12-26T04:00:00.000Z', testMode: true })
    expect(comp.subject).toBe('[TEST] You’ve got KlaroPH Pro — on us')
    expect(comp.html).toContain('No Pro access was granted and no account was changed.')
  })
})

describe('production templates', () => {
  it('hard-code no dates or prices', () => {
    const source = readFileSync(path.join(__dirname, 'proEmails.ts'), 'utf8')
    expect(source).not.toMatch(/₱\s?\d|\b20\d\d-\d\d-\d\d\b|(January|February|March|April|May|June|July|August|September|October|November|December) \d/)
  })
})

describe('extractPaidAmount', () => {
  const event = (attributes: Record<string, unknown>) => ({ data: { attributes: { data: { attributes } } } })

  it('reads a QR Ph payment.paid payload', () => {
    expect(extractPaidAmount(event({ amount: 143_040, currency: 'PHP' }))).toEqual({ centavos: 143_040, currency: 'PHP' })
  })

  it('reads a checkout_session.payment.paid payload', () => {
    expect(extractPaidAmount(event({ payments: [{ attributes: { amount: 19_900, currency: 'PHP' } }] }))).toEqual({
      centavos: 19_900,
      currency: 'PHP',
    })
  })

  it('returns null for missing or malformed amounts', () => {
    expect(extractPaidAmount(null)).toBeNull()
    expect(extractPaidAmount(event({}))).toBeNull()
    expect(extractPaidAmount(event({ amount: '199', currency: 'PHP' }))).toBeNull()
    expect(extractPaidAmount(event({ amount: 0, currency: 'PHP' }))).toBeNull()
    expect(extractPaidAmount(event({ amount: 19_900, currency: 'NOT-A-CURRENCY' }))).toBeNull()
  })
})
