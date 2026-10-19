import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { PRO_ONE_TIME_LINE, PRO_ONE_TIME_PESOS } from '@/lib/planPricing'

const upgrade = readFileSync(path.resolve(__dirname, 'UpgradeModal.tsx'), 'utf8')
const qr = readFileSync(path.resolve(__dirname, 'PaymentQRModal.tsx'), 'utf8')

const RECURRING = /\/month|\/year|\bannual\b|\brenews\b|\blifetime\b/i

describe('one-time Pro buying screens', () => {
  it('shows a single ₱999 price and the one-time line', () => {
    expect(PRO_ONE_TIME_PESOS).toBe(999)
    expect(PRO_ONE_TIME_LINE).toBe(
      'Pay once. No subscription. Pro stays on your account for as long as KlaroPH runs.'
    )
    for (const source of [upgrade, qr]) {
      expect(source).toContain('PRO_ONE_TIME_PESOS')
      expect(source).toContain('PRO_ONE_TIME_LINE')
      expect(source).not.toMatch(RECURRING)
    }
  })

  it('keeps Monthly Budgeting as a feature name and nowhere else on the upgrade screen', () => {
    const matches = upgrade.match(/\bmonthly\b/gi) ?? []
    expect(matches).toEqual(['Monthly'])
    expect(upgrade).toContain('Monthly Budgeting')
    expect(qr).not.toMatch(/\bmonthly\b/i)
  })

  it('does not offer a promo code', () => {
    expect(upgrade).not.toMatch(/promo/i)
    expect(qr).not.toMatch(/promo/i)
    expect(upgrade).not.toContain('FNDRUSER1299')
    expect(qr).not.toContain('FNDRUSER1299')
  })
})
