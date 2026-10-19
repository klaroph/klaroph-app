import { describe, expect, it } from 'vitest'
import {
  normalizeSubscriptionFromRow,
  shouldBlockNewProPurchase,
} from './subscriptionStateCore'

const now = new Date('2026-09-23T12:00:00.000Z')

describe('normalizeSubscriptionFromRow', () => {
  it('treats a canceled lifetime row on the free plan as active', () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'canceled',
        plan_id: 'plan_free',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
      },
      now
    )
    expect(sub.state).toBe('ACTIVE')
    expect(sub.isLifetime).toBe(true)
  })

  it('treats is_lifetime as active without reading the end date or status', () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'expired',
        plan_id: 'plan_pro',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
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
  it('blocks only an already-lifetime user', () => {
    const lifetime = normalizeSubscriptionFromRow(
      {
        status: 'expired',
        plan_id: 'plan_pro',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
      },
      now
    )
    const monthly = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2026-10-23T12:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    const annual = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan_pro',
        current_period_end: '2027-09-23T12:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect(lifetime.state).toBe('ACTIVE')
    expect(shouldBlockNewProPurchase(lifetime)).toBe(true)
    expect(shouldBlockNewProPurchase(monthly)).toBe(false)
    expect(shouldBlockNewProPurchase(annual)).toBe(false)
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
    expect(shouldBlockNewProPurchase(expired)).toBe(false)
  })
})
