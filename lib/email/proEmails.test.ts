import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { PRO_PLAN_FEATURES } from '@/lib/planFeatures'
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
const RENEWAL_CLAIM = /renews automatically|auto-renew|will renew|next renewal|renews on/i

describe('renderPaidProEmail', () => {
  it('renders the V2 shell with the real plan, amount and end date', () => {
    const { subject, html, text } = paid()
    expect(subject).toBe('You’re officially KlaroPH Pro')
    expect(html).toContain('logo-klaroph-blue.png')
    expect(html).toContain('https://klaroph.com/dashboard')
    expect(html).toContain('Open KlaroPH →')
    expect(text).toContain('Hi Juan,')
    expect(text).toContain('Plan: KlaroPH Pro · Monthly')
    expect(text).toContain('Amount paid: ₱1,430.40')
    expect(text).toContain('Active until: October 26, 2026')
    expect(text).toContain('won’t renew or charge you automatically')
    expect(text).not.toMatch(RENEWAL_CLAIM)
  })

  it('labels annual plans and uses Philippine time for dates', () => {
    const { text } = paid({ planType: 'annual', activeUntil: '2027-03-08T17:30:00.000Z' })
    expect(text).toContain('Plan: KlaroPH Pro · Annual')
    expect(text).toContain('Active until: March 9, 2027')
  })

  it('omits facts it does not have instead of inventing them', () => {
    const { text } = paid({ amountPaid: null, activeUntil: null })
    expect(text).not.toMatch(/Amount paid|Active until/)
    expect(text).not.toMatch(/₱/)
  })

  it('shows lifetime access with no end date and no renewal language', () => {
    const { text, html } = paid({ isLifetime: true })
    expect(text).toContain('Plan: KlaroPH Pro · Lifetime')
    expect(text).toContain('Access: Lifetime')
    expect(text).not.toContain('Active until')
    for (const body of [text, html]) expect(body).not.toMatch(/renew/i)
  })

  it('lists the canonical Pro features', () => {
    const { text } = paid()
    for (const feature of PRO_ONLY) expect(text).toContain(`- ${feature}`)
  })
})

describe('renderComplimentaryProEmail', () => {
  it('states the real end date and that nothing renews or is charged', () => {
    const { subject, text } = renderComplimentaryProEmail({ firstName: 'Juan', validUntil: '2026-12-26T04:00:00.000Z' })
    expect(subject).toBe('You’ve got KlaroPH Pro — on us')
    expect(text).toContain('Hi Juan,')
    expect(text).toContain('Plan: KlaroPH Pro · Complimentary')
    expect(text).toContain('Active until: December 26, 2026')
    expect(text).toContain('will not renew or charge you automatically')
    for (const feature of PRO_ONLY) expect(text).toContain(`- ${feature}`)
  })

  it('has no payment, renewal, lifetime, marketing or founder language', () => {
    const { html, text } = renderComplimentaryProEmail({ firstName: null, validUntil: '2026-12-26T04:00:00.000Z' })
    expect(text).toContain('Hi there,')
    for (const body of [html, text]) {
      expect(body).not.toMatch(/Amount paid|₱|lifetime|unsubscribe|utm_|founder|admin/i)
      expect(body).not.toMatch(RENEWAL_CLAIM)
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
    expect(sample.text).toContain('No payment was made and no subscription was changed.')

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
