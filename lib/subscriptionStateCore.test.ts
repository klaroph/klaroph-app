import { describe, expect, it } from 'vitest'
import {
  normalizeSubscriptionFromRow,
  shouldBlockNewProPurchase,
} from './subscriptionStateCore'

const now = new Date('2026-09-23T12:00:00.000Z')

describe('normalizeSubscriptionFromRow', () => {
  it('keeps lifetime users ACTIVE even when current_period_end is in the past', () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
        auto_renew: false,
      },
      now
    )
    expect(sub.state).toBe('ACTIVE')
    expect(sub.isLifetime).toBe(true)
  })

  it('treats unexpired prepaid Pro as ACTIVE', () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2026-10-23T12:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect(sub.state).toBe('ACTIVE')
  })

  it('treats expired prepaid Pro as EXPIRED (not lifetime)', () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2026-08-01T00:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect(sub.state).toBe('EXPIRED')
  })
})

describe('shouldBlockNewProPurchase', () => {
  it('blocks pro, clarity_premium, and lifetime users from buying another prepaid period', () => {
    const lifetime = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
      },
      now
    )
    const prepaidPro = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2026-10-23T12:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect(shouldBlockNewProPurchase(lifetime, 'pro')).toBe(true)
    expect(shouldBlockNewProPurchase(prepaidPro, 'pro')).toBe(true)
    expect(shouldBlockNewProPurchase(prepaidPro, 'clarity_premium')).toBe(true)
    expect(shouldBlockNewProPurchase(lifetime, null)).toBe(true)
  })

  it('allows expired prepaid Pro to purchase again', () => {
    const expired = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2026-08-01T00:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect(shouldBlockNewProPurchase(expired, 'pro')).toBe(false)
  })
})
