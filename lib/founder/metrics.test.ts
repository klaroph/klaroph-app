import { describe, expect, it } from 'vitest'
import {
  buildAttention,
  buildFounderUsers,
  buildRecentActivity,
  campaignStatus,
  databaseHealth,
  expiringPaidPro,
  planKind,
  summarizeAiUsage,
  summarizeCampaignSends,
  summarizeOpenSupport,
  summarizeRevenue,
  summarizeUsers,
  type AttentionInput,
  type FounderSubscription,
  type PaymentEventRow,
} from './metrics'
import { filterUsers } from './userList'

const NOW = new Date('2026-09-26T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

const sub = (over: Partial<FounderSubscription>): FounderSubscription => ({
  user_id: 'u',
  plan_name: 'pro',
  status: 'active',
  current_period_end: daysAhead(10),
  is_lifetime: false,
  payment_provider: 'paymongo',
  plan_type: 'monthly',
  ...over,
})

describe('planKind', () => {
  it('uses the app entitlement rule', () => {
    expect(planKind(undefined, NOW)).toBe('free')
    expect(planKind(sub({ plan_name: 'free' }), NOW)).toBe('free')
    expect(planKind(sub({}), NOW)).toBe('paid')
    expect(planKind(sub({ current_period_end: daysAgo(1) }), NOW)).toBe('free')
    expect(planKind(sub({ payment_provider: 'manual' }), NOW)).toBe('complimentary')
  })

  it('keeps lifetime Pro after the period date passes', () => {
    expect(planKind(sub({ is_lifetime: true, current_period_end: daysAgo(90) }), NOW)).toBe('lifetime')
  })

  it('counts grace-period subscriptions as Pro', () => {
    expect(planKind(sub({ status: 'past_due', grace_period_until: daysAhead(2) }), NOW)).toBe('paid')
  })
})

describe('founder users', () => {
  const authUsers = [
    { id: 'a', email: 'a@x.com', email_confirmed_at: daysAgo(40), last_sign_in_at: daysAgo(2) },
    { id: 'b', email: 'b@x.com', email_confirmed_at: daysAgo(3), last_sign_in_at: daysAgo(60) },
    { id: 't', email: 't@x.com', email_confirmed_at: daysAgo(3), last_sign_in_at: daysAgo(1) },
    { id: 'gone', email: 'g@x.com', email_confirmed_at: daysAgo(3), deleted_at: daysAgo(1) },
  ]
  const profile = (id: string, user_type: string, created: number, unsub: string | null = null) => ({
    id,
    full_name: `Name ${id}`,
    nickname: null,
    user_type,
    created_at: daysAgo(created),
    marketing_emails_unsubscribed_at: unsub,
  })
  const users = buildFounderUsers({
    authUsers,
    profiles: [profile('a', 'user', 40), profile('b', 'user', 3, daysAgo(1)), profile('t', 'tester', 3), profile('gone', 'user', 3)],
    subscriptions: [sub({ user_id: 'a', current_period_end: daysAhead(3) }), sub({ user_id: 't' })],
    now: NOW,
  })

  it('joins accounts, skips deleted auth users, and sorts newest first', () => {
    expect(users.map((u) => u.id)).toEqual(['b', 't', 'a'])
    expect(users.find((u) => u.id === 'a')).toMatchObject({ plan: 'paid', status: 'active', isNew: false })
    expect(users.find((u) => u.id === 'b')).toMatchObject({ plan: 'free', status: 'dormant', isNew: true, unsubscribed: true })
  })

  it('summarizes real customers only', () => {
    expect(summarizeUsers(users)).toEqual({
      total: 2,
      active: 1,
      newThisWeek: 1,
      unsubscribed: 1,
      pro: { total: 1, paid: 1, lifetime: 0, complimentary: 0 },
    })
  })

  it('filters by segment and search, keeping testers separate', () => {
    expect(filterUsers(users, 'all').map((u) => u.id)).toEqual(['b', 'a'])
    expect(filterUsers(users, 'testers').map((u) => u.id)).toEqual(['t'])
    expect(filterUsers(users, 'pro').map((u) => u.id)).toEqual(['a'])
    expect(filterUsers(users, 'dormant').map((u) => u.id)).toEqual(['b'])
    expect(filterUsers(users, 'all', 'A@X').map((u) => u.id)).toEqual(['a'])
  })

  it('searches display name, full name and email, composed with the segment filter', () => {
    const [nick] = buildFounderUsers({
      authUsers: [{ id: 'n', email: 'n@x.com', email_confirmed_at: daysAgo(1) }],
      profiles: [{ ...profile('n', 'user', 1), nickname: 'Pau', full_name: 'Paulina Reyes' }],
      subscriptions: [sub({ user_id: 'n', payment_provider: 'manual' })],
      now: NOW,
    })
    expect(nick).toMatchObject({ name: 'Pau', fullName: 'Paulina Reyes', plan: 'complimentary', proEndsAt: daysAhead(10) })
    const all = [...users, nick]
    expect(filterUsers(all, 'all', 'reyes').map((u) => u.id)).toEqual(['n'])
    expect(filterUsers(all, 'pro', 'pau').map((u) => u.id)).toEqual(['n'])
    expect(filterUsers(all, 'free', 'pau')).toEqual([])
    expect(filterUsers(all, 'all', '  ').map((u) => u.id)).toEqual(['b', 'a', 'n'])
  })

  it('never uses an email address as a display name', () => {
    const [user] = buildFounderUsers({
      authUsers: [{ id: 'e', email: 'e@x.com', email_confirmed_at: daysAgo(1) }],
      profiles: [{ ...profile('e', 'user', 1), full_name: 'e@x.com' }],
      subscriptions: [],
      now: NOW,
    })
    expect(user.name).toBeNull()
    expect(buildRecentActivity({ users: [user], purchases: [], campaigns: [] })[0].text).toBe('New user')
  })

  it('flags paid Pro ending within 7 days', () => {
    expect(expiringPaidPro(users, NOW).map((u) => u.id)).toEqual(['a'])
  })
})

describe('summarizeRevenue', () => {
  const event = (over: Partial<PaymentEventRow>): PaymentEventRow => ({
    event_type: 'payment.paid',
    processed_at: daysAgo(1),
    livemode: 'true',
    amount: '9900',
    net_amount: '9750',
    fee: '150',
    plan: 'pro',
    plan_type: 'monthly',
    user_id: 'real',
    promo_code: null,
    ...over,
  })

  it('counts only live Pro payments from real accounts', () => {
    const summary = summarizeRevenue(
      [
        event({}),
        event({ processed_at: daysAgo(45), amount: '99900', net_amount: '98000', fee: '1900', plan_type: 'annual' }),
        event({ livemode: 'false' }),
        event({ user_id: 'tester' }),
        event({ plan: null }),
        event({ event_type: 'payment.failed', processed_at: daysAgo(2) }),
        event({ event_type: 'payment.failed', processed_at: daysAgo(10) }),
      ],
      new Set(['real']),
      NOW
    )
    expect(summary.allTime).toEqual({ gross: 1098, net: 1077.5, fees: 20.5, count: 2 })
    expect(summary.last30).toEqual({ gross: 99, net: 97.5, fees: 1.5, count: 1 })
    expect(summary.failedLast7).toBe(1)
    expect(summary.recent.map((p) => p.planType)).toEqual(['monthly', 'annual'])
    expect(summary.lastWebhookAt).toBe(daysAgo(1))
  })
})

describe('campaign delivery', () => {
  const rows = [
    { campaign_id: 'c', status: 'sent', sent_at: '2026-09-26T22:22:05Z' },
    { campaign_id: 'c', status: 'sent', sent_at: '2026-09-26T22:22:05Z' },
    { campaign_id: 'other', status: 'pending', sent_at: null },
  ]

  it('summarizes sends per campaign', () => {
    expect(summarizeCampaignSends(rows, 'c')).toEqual({ sent: 2, pending: 0, lastSentAt: '2026-09-26T22:22:05Z' })
    expect(campaignStatus(summarizeCampaignSends(rows, 'c'))).toBe('sent')
    expect(campaignStatus(summarizeCampaignSends(rows, 'other'))).toBe('sending')
    expect(campaignStatus(summarizeCampaignSends(rows, 'new'))).toBe('draft')
  })
})

describe('summarizeAiUsage', () => {
  it('counts today only and detects users at their plan limit', () => {
    const today = NOW.toISOString().slice(0, 10)
    const summary = summarizeAiUsage(
      [
        { user_id: 'free', usage_date: today, generation_count: 1, feature: 'insight' },
        { user_id: 'pro', usage_date: today, generation_count: 2, feature: 'chat' },
        { user_id: 'pro', usage_date: '2026-09-25', generation_count: 9, feature: 'chat' },
      ],
      new Map([['pro', 'paid' as const]]),
      NOW
    )
    expect(summary).toEqual({
      requestsToday: 3,
      byFeature: { insight: 1, chat: 2 },
      freeRequests: 1,
      proRequests: 2,
      usersToday: 2,
      usersAtLimit: 1,
    })
  })
})

describe('summarizeOpenSupport', () => {
  it('counts real-customer and anonymous requests only, oldest first', () => {
    const testers = new Set(['t1'])
    expect(
      summarizeOpenSupport(
        [
          { user_id: 't1', created_at: daysAgo(30) },
          { user_id: 'u1', created_at: daysAgo(2) },
          { user_id: null, created_at: daysAgo(5) },
        ],
        testers
      )
    ).toEqual({ count: 2, oldestAt: daysAgo(5) })
    expect(summarizeOpenSupport([{ user_id: 't1', created_at: daysAgo(3) }], testers)).toEqual({ count: 0, oldestAt: null })
  })
})

describe('buildAttention', () => {
  const calm: AttentionInput = {
    now: NOW,
    databaseOk: true,
    openSupport: { count: 0, oldestAt: null },
    failedPaymentsLast7: 0,
    expiringPaidPro: 0,
    deliveryConfigured: true,
    sendsEnabled: false,
    campaigns: [{ id: 'c', name: 'Launch', delivery: { sent: 63, pending: 0, lastSentAt: daysAgo(0) }, eligible: 0 }],
  }

  it('is empty when nothing needs a decision', () => {
    expect(buildAttention(calm)).toEqual([])
  })

  it('raises real conditions in severity order', () => {
    const items = buildAttention({
      ...calm,
      databaseOk: false,
      openSupport: { count: 3, oldestAt: daysAgo(5) },
      failedPaymentsLast7: 1,
      sendsEnabled: true,
      campaigns: [{ id: 'c', name: 'Launch', delivery: { sent: 60, pending: 3, lastSentAt: null }, eligible: 0 }],
    })
    expect(items.map((i) => i.id)).toEqual(['database', 'campaign-pending-c', 'failed-payments', 'support', 'kill-switch'])
    expect(items.find((i) => i.id === 'support')?.detail).toBe('Oldest waiting 5 days.')
  })

  it('links open support to the inbox and follows the live open count', () => {
    const support = (count: number) => buildAttention({ ...calm, openSupport: { count, oldestAt: count ? daysAgo(209) : null } }).find((i) => i.id === 'support')
    expect(support(3)).toMatchObject({ title: '3 open support requests', detail: 'Oldest waiting 209 days.', href: '/admin/founder/support' })
    expect(support(2)?.title).toBe('2 open support requests')
    expect(support(1)?.title).toBe('1 open support request')
    expect(support(0)).toBeUndefined()
  })

  it('announces a ready draft and does not nag about the kill switch while there is something to send', () => {
    const items = buildAttention({
      ...calm,
      sendsEnabled: true,
      campaigns: [{ id: 'd', name: 'Draft', delivery: { sent: 0, pending: 0, lastSentAt: null }, eligible: 40 }],
    })
    expect(items.map((i) => i.id)).toEqual(['campaign-ready-d'])
  })
})

describe('activity and health', () => {
  it('merges recent founder events without testers', () => {
    const events = buildRecentActivity({
      users: [
        { id: 'a', name: 'Juan Dela Cruz', isTester: false, signedUpAt: daysAgo(3) },
        { id: 't', name: 'Tester', isTester: true, signedUpAt: daysAgo(1) },
      ] as never,
      purchases: [{ at: daysAgo(2), planType: 'monthly', amount: 99, promo: false }],
      campaigns: [{ name: 'Launch', delivery: { sent: 63, pending: 0, lastSentAt: daysAgo(0) } }],
    })
    expect(events.map((e) => e.text)).toEqual(['Launch sent · 63 accepted', 'Pro monthly purchase · ₱99.00', 'New user · Juan'])
  })

  it('reports database health honestly', () => {
    expect(databaseHealth({ ok: false, latencyMs: 0 }).tone).toBe('bad')
    expect(databaseHealth({ ok: true, latencyMs: 120 })).toEqual({ label: 'Database', value: 'Responding · 120 ms', tone: 'ok' })
    expect(databaseHealth({ ok: true, latencyMs: 2000 }).tone).toBe('warn')
  })
})
