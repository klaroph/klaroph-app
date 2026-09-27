import { describe, expect, it } from 'vitest'
import { buildFounderReport, inWindow, manilaReportWindow, type ReportSnapshot } from './report'
import type { SupportThread } from './support'
import type { FounderUser } from './userList'

/** 10:00 AM Manila on Sep 27, 2026 — when the cron runs. */
const NOW = new Date('2026-09-27T02:00:00.000Z')
const START = '2026-09-25T16:00:00.000Z' // Sep 26 00:00:00 Manila
const LAST_MS = '2026-09-26T15:59:59.999Z' // Sep 26 23:59:59.999 Manila

function user(over: Partial<FounderUser> = {}): FounderUser {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    name: 'Juan',
    fullName: null,
    email: 'juan@example.com',
    isTester: false,
    plan: 'free',
    planType: null,
    proEndsAt: null,
    signedUpAt: '2026-01-01T00:00:00.000Z',
    lastSignInAt: null,
    status: 'dormant',
    isNew: false,
    unsubscribed: false,
    ...over,
  }
}

function thread(over: Partial<SupportThread> = {}): SupportThread {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Maria Santos',
    email: 'maria@example.com',
    isTester: false,
    title: 'Payment issue',
    message: 'Help',
    status: 'open',
    createdAt: '2026-09-25T02:00:00.000Z',
    lastActivityAt: '2026-09-25T02:00:00.000Z',
    replies: [],
    awaitingReply: true,
    hasUnconfirmedReply: false,
    ...over,
  }
}

function snapshot(over: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return { users: [], revenue: { recent: [], failures: [] }, database: { ok: true }, attention: [], unavailable: [], ...over }
}

describe('manilaReportWindow', () => {
  it('reports the previous Manila calendar day as an exact [00:00, 24:00) window', () => {
    const w = manilaReportWindow(NOW)
    expect(w.date).toBe('2026-09-26')
    expect(w.start.toISOString()).toBe(START)
    expect(w.end.toISOString()).toBe('2026-09-26T16:00:00.000Z')
  })

  it('follows the Manila date, not the UTC or server date', () => {
    expect(manilaReportWindow(new Date('2026-09-26T16:30:00.000Z')).date).toBe('2026-09-26') // 00:30 Sep 27 Manila
    expect(manilaReportWindow(new Date('2026-09-26T15:30:00.000Z')).date).toBe('2026-09-25') // 23:30 Sep 26 Manila
    expect(manilaReportWindow(new Date('2026-01-01T01:00:00.000Z')).date).toBe('2025-12-31') // across a year boundary
  })

  it('includes 00:00:00 and 23:59:59.999 and excludes the neighbouring days', () => {
    const w = manilaReportWindow(NOW)
    expect(inWindow(START, w)).toBe(true)
    expect(inWindow(LAST_MS, w)).toBe(true)
    expect(inWindow('2026-09-26T16:00:00.000Z', w)).toBe(false)
    expect(inWindow('2026-09-25T15:59:59.999Z', w)).toBe(false)
    expect(inWindow(null, w)).toBe(false)
  })
})

describe('buildFounderReport', () => {
  it('states the reporting date in short and long form', () => {
    const r = buildFounderReport({ now: NOW, snapshot: snapshot(), support: [] })
    expect(r.shortLabel).toBe('Sep 26')
    expect(r.longLabel).toBe('Saturday, September 26, 2026')
  })

  it('counts new users inside the window only, with a previous-day comparison, testers excluded', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot({
        users: [
          user({ signedUpAt: START }),
          user({ signedUpAt: LAST_MS }),
          user({ signedUpAt: '2026-09-26T16:00:00.000Z' }), // today
          user({ signedUpAt: '2026-09-25T10:00:00.000Z' }), // previous day
          user({ signedUpAt: START, isTester: true }),
        ],
      }),
      support: [],
    })
    expect(r.yesterday.newUsers).toBe(2)
    expect(r.yesterday.newUsersPreviousDay).toBe(1)
  })

  it('keeps current snapshot counts (active, dormant, Pro) separate from yesterday activity', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot({
        users: [
          user({ status: 'active', plan: 'paid' }),
          user({ status: 'active', plan: 'lifetime' }),
          user({ status: 'dormant', plan: 'complimentary' }),
          user({ status: 'dormant' }),
          user({ status: 'unconfirmed' }),
          user({ status: 'active', plan: 'paid', isTester: true }),
        ],
      }),
      support: [],
    })
    expect(r.current).toEqual({ active: 2, dormant: 2, pro: 3 })
    expect(r.yesterday.newUsers).toBe(0)
  })

  it('counts yesterday revenue and failures from the canonical dock revenue summary', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot({
        revenue: {
          recent: [
            { at: START, planType: 'monthly', amount: 199, promo: false },
            { at: LAST_MS, planType: 'annual', amount: 1999, promo: false },
            { at: '2026-09-26T17:00:00.000Z', planType: 'monthly', amount: 199, promo: false },
          ],
          failures: ['2026-09-26T03:00:00.000Z', '2026-09-24T03:00:00.000Z'],
        },
      }),
      support: [],
    })
    expect(r.yesterday.payments).toEqual({ count: 2, gross: 2198 })
    expect(r.yesterday.failedPayments).toBe(1)
  })

  it('lists real customers awaiting a reply, oldest first, and ignores testers and answered or resolved threads', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot(),
      support: [
        thread({ name: 'Newer', createdAt: '2026-09-26T05:00:00.000Z' }),
        thread({ name: 'Oldest', createdAt: '2026-09-23T02:00:00.000Z' }),
        thread({ name: 'Tester', isTester: true, createdAt: '2026-09-20T02:00:00.000Z' }),
        thread({ name: 'Answered', awaitingReply: false }),
        thread({ name: 'Resolved', status: 'resolved', awaitingReply: false }),
      ],
    })
    expect(r.support).toMatchObject({ open: 3, awaitingReply: 2, oldestWaitingDays: 4 })
    expect(r.support?.needsAction.map((n) => n.who)).toEqual(['Oldest', 'Newer'])
    expect(r.support?.needsAction[0]).toEqual({ who: 'Oldest', title: 'Payment issue', waitingDays: 4 })
    expect(r.yesterday.newSupportRequests).toBe(1)
  })

  it('caps the needs-action list at five', () => {
    const support = Array.from({ length: 7 }, (_, i) => thread({ name: `C${i}`, createdAt: `2026-09-1${i}T00:00:00.000Z` }))
    const r = buildFounderReport({ now: NOW, snapshot: snapshot(), support })
    expect(r.support?.awaitingReply).toBe(7)
    expect(r.support?.needsAction).toHaveLength(5)
  })

  it('is a quiet day when nothing happened and nothing needs action', () => {
    const r = buildFounderReport({ now: NOW, snapshot: snapshot({ users: [user()] }), support: [] })
    expect(r.quiet).toBe(true)
    expect(r.health).toEqual([])
  })

  it('reports unavailable sources as unavailable rather than zero', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot({ unavailable: ['Payments', 'Subscriptions'] }),
      support: null,
    })
    expect(r.yesterday.payments).toBeNull()
    expect(r.yesterday.failedPayments).toBeNull()
    expect(r.current.pro).toBeNull()
    expect(r.support).toBeNull()
    expect(r.health).toHaveLength(3)
    expect(r.quiet).toBe(false)
  })

  it('surfaces critical dock attention items as health issues', () => {
    const r = buildFounderReport({
      now: NOW,
      snapshot: snapshot({
        attention: [
          { id: 'database', tone: 'critical', title: 'Database check failed', detail: '' },
          { id: 'renewals', tone: 'info', title: '2 Pro plans expire soon', detail: '' },
        ],
      }),
      support: [],
    })
    expect(r.health).toEqual(['Database check failed'])
  })
})
