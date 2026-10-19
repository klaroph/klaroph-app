import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from() {
      throw new Error('supabaseAdmin is not used by these tests')
    },
  },
}))
import { manilaWeekWindow, weeklyCampaignId } from './manilaWeek'
import { verifyUnsubscribeToken } from './unsubscribeToken'
import {
  deliverWeeklyBatch,
  keepOnboarded,
  loadWeekEntries,
  runWeeklySummary,
  selectWeeklyRecipients,
  sendWeeklySummaryTest,
  weeklyGreetingName,
  weeklySummarySendsEnabled,
  type WeeklyPrepareResult,
  type WeeklyRecipient,
} from './weeklySummary'
import { summarizeUserWeek, type LedgerEntry } from './weeklySummaryEmail'
import type { AudienceAuthUser, AudienceProfile } from './marketingAudience'

const NOW = new Date('2026-10-19T00:00:00.000Z')
const WINDOW = manilaWeekWindow(NOW)
const CAMPAIGN_ID = weeklyCampaignId(WINDOW)
const RECENT = '2026-10-01T00:00:00.000Z'
const LONG_AGO = '2026-01-01T00:00:00.000Z'
const CURRENT_AMOUNT = 864201357.89
const PREVIOUS_AMOUNT = 975310864.12

const links = { appUrl: 'https://klaroph.com', unsubscribeSecret: 'u'.repeat(40) }
const resend = { apiKey: 're_test', from: 'KlaroPH <hello@klaroph.com>' }

function user(id: string, overrides: Partial<AudienceAuthUser> = {}): AudienceAuthUser {
  return { id, email: `${id}@example.com`, email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: RECENT, ...overrides }
}

function profile(id: string, overrides: Partial<AudienceProfile & { onboarding_completed?: boolean | null }> = {}) {
  return {
    id,
    full_name: null,
    nickname: null,
    user_type: 'user',
    marketing_emails_unsubscribed_at: null,
    onboarding_completed: true,
    ...overrides,
  }
}

type Row = { campaign_id: string; user_id: string; status: string }

function fakeAdmin(existing: Row[] = []) {
  const rows = new Map(existing.map((row) => [row.user_id, { ...row }]))
  const admin = {
    from: () => ({
      upsert: (input: Row[], opts: { ignoreDuplicates?: boolean }) => {
        const inserted: Row[] = []
        for (const row of input) {
          if (rows.has(row.user_id) && opts.ignoreDuplicates) continue
          rows.set(row.user_id, { ...rows.get(row.user_id), ...row })
          inserted.push(row)
        }
        const result = { data: inserted.map((row) => ({ user_id: row.user_id })), error: null }
        return { select: async () => result, then: (resolve: (value: typeof result) => void) => resolve(result) }
      },
      delete: () => ({
        eq: () => ({
          eq: () => ({
            in: async (_col: string, ids: string[]) => {
              ids.forEach((id) => rows.delete(id))
              return { error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient, rows }
}

function recipient(id: string, greetingName: string | null = 'Jun'): WeeklyRecipient {
  return { userId: id, email: `${id}@example.com`, firstName: greetingName, greetingName }
}

function prepared(recipients: WeeklyRecipient[], entries: LedgerEntry[]): WeeklyPrepareResult {
  return { ok: true, window: WINDOW, campaignId: CAMPAIGN_ID, recipients, entries }
}

describe('weekly audience', () => {
  const now = new Date('2026-10-19T00:00:00.000Z')
  const ids = (authUsers: AudienceAuthUser[], profiles: ReturnType<typeof profile>[]) =>
    selectWeeklyRecipients({ authUsers, profiles, now }).map((item) => item.userId)

  it('includes opted-in users who have not signed in for 30 days', () => {
    expect(
      ids(
        [user('recent'), user('dormant', { last_sign_in_at: LONG_AGO }), user('never', { last_sign_in_at: null })],
        [profile('recent'), profile('dormant'), profile('never')],
      ),
    ).toEqual(['recent', 'dormant', 'never'])
  })

  it('requires a confirmed email', () => {
    expect(ids([user('ready'), user('unconfirmed', { email_confirmed_at: null })], [profile('ready'), profile('unconfirmed')])).toEqual(['ready'])
  })

  it('excludes deleted and banned accounts', () => {
    expect(
      ids(
        [user('ready'), user('deleted', { deleted_at: LONG_AGO }), user('banned', { banned_until: '2099-01-01T00:00:00Z' })],
        [profile('ready'), profile('deleted'), profile('banned')],
      ),
    ).toEqual(['ready'])
  })

  it('excludes testers', () => {
    expect(ids([user('ready'), user('tester')], [profile('ready'), profile('tester', { user_type: 'tester' })])).toEqual(['ready'])
  })

  it('gives an unsubscribed user nothing, even when they logged entries', () => {
    const authUsers = [user('subscribed'), user('unsubscribed')]
    const profiles = [
      profile('subscribed', { nickname: 'Jun' }),
      profile('unsubscribed', { marketing_emails_unsubscribed_at: '2026-09-01T00:00:00Z' }),
    ]
    expect(ids(authUsers, profiles)).toEqual(['subscribed'])

    const entries: LedgerEntry[] = [
      { userId: 'subscribed', date: '2026-10-14', kind: 'expense', category: 'Groceries', amount: 10 },
      { userId: 'unsubscribed', date: '2026-10-14', kind: 'expense', category: 'Groceries', amount: CURRENT_AMOUNT },
    ]
    const facts = summarizeUserWeek(entries, 'unsubscribed', WINDOW)
    expect(facts).not.toBeNull()
    expect(ids(authUsers, profiles)).not.toContain('unsubscribed')
  })

  it('requires onboarding to be completed', () => {
    expect(
      ids(
        [user('ready'), user('incomplete'), user('missing')],
        [
          profile('ready'),
          profile('incomplete', { onboarding_completed: false }),
          profile('missing', { onboarding_completed: null }),
        ],
      ),
    ).toEqual(['ready'])
    expect(keepOnboarded([{ userId: 'a' }, { userId: 'b' }], [{ id: 'a', onboarding_completed: true }, { id: 'b', onboarding_completed: false }])).toEqual([
      { userId: 'a' },
    ])
  })

  it('greets with the display-name helper, nickname first', () => {
    expect(weeklyGreetingName({ nickname: 'Jun', full_name: 'Juan Dela Cruz' }, 'juan@example.com')).toBe('Jun')
    expect(weeklyGreetingName({ nickname: null, full_name: 'Juan Dela Cruz' }, 'juan@example.com')).toBe('Juan')
    expect(weeklyGreetingName({ nickname: null, full_name: null }, 'juan@example.com')).toBe('juan')
  })
})

describe('weeklySummarySendsEnabled', () => {
  it('sends only for the exact string true', () => {
    expect(weeklySummarySendsEnabled({ WEEKLY_SUMMARY_SENDS_ENABLED: 'true' })).toBe(true)
    for (const value of [undefined, '', 'TRUE', '1', ' true', 'true ']) {
      expect(weeklySummarySendsEnabled({ WEEKLY_SUMMARY_SENDS_ENABLED: value })).toBe(false)
    }
  })
})

describe('runWeeklySummary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const entries: LedgerEntry[] = [
    { userId: 'active', date: '2026-10-14', kind: 'expense', category: 'Groceries', amount: CURRENT_AMOUNT },
    { userId: 'active', date: '2026-10-07', kind: 'expense', category: 'Groceries', amount: PREVIOUS_AMOUNT },
    { userId: 'quiet', date: '2026-10-19', kind: 'expense', category: 'Rent', amount: 135790246.75 },
  ]

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns counts and sends nothing when the flag is off', async () => {
    const deliver = vi.fn()
    const result = await runWeeklySummary(NOW, {
      env: { WEEKLY_SUMMARY_SENDS_ENABLED: 'false' },
      prepare: async () => prepared([recipient('active'), recipient('quiet')], entries),
      deliver,
    })
    expect(deliver).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        sendsEnabled: false,
        campaignId: CAMPAIGN_ID,
        eligible: 2,
        skippedNoActivity: 1,
        wouldSend: 1,
      },
    })
    expect(JSON.stringify(result.body)).not.toContain('@')
    expect(JSON.stringify(result.body)).not.toContain('864201357')
  })

  it('does not claim or send when the flag is missing, even if delivery is configured', async () => {
    const deliver = vi.fn()
    const result = await runWeeklySummary(NOW, {
      env: {},
      prepare: async () => prepared([recipient('active')], entries),
      deliver,
    })
    expect(result.body.sendsEnabled).toBe(false)
    expect(result.body.wouldSend).toBe(1)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('skips an already claimed user on a rerun', async () => {
    const { admin } = fakeAdmin()
    const sendBatch = vi.fn().mockResolvedValue({ ok: true, ids: ['e1'] })
    const deps = { admin, resend, links, sendBatch, pause: async () => {} }
    const options = {
      env: { WEEKLY_SUMMARY_SENDS_ENABLED: 'true' },
      prepare: async () => prepared([recipient('active'), recipient('quiet')], entries),
      deliver: (campaignId: string, batch: Parameters<typeof deliverWeeklyBatch>[2]) =>
        deliverWeeklyBatch(deps, campaignId, batch),
    }
    const first = await runWeeklySummary(NOW, options)
    const second = await runWeeklySummary(NOW, options)

    expect(first.body).toMatchObject({ sendsEnabled: true, eligible: 2, skippedNoActivity: 1, wouldSend: 1, sent: 1, failed: 0, skipped: 0 })
    expect(second.body).toMatchObject({ sent: 0, failed: 0, skipped: 1 })
    expect(sendBatch).toHaveBeenCalledTimes(1)
    const messages = sendBatch.mock.calls[0][1]
    expect(messages.map((message: { to: string }) => message.to)).toEqual(['active@example.com'])
    const payload = JSON.stringify(messages)
    expect(payload).not.toContain('864201357')
    expect(payload).not.toContain('975310864')
    expect(payload).not.toMatch(/₱|peso/i)
    expect(messages[0].subject).toBe('Your week in KlaroPH')
    expect(messages[0].headers['List-Unsubscribe']).toContain('/api/email/unsubscribe?token=')
  })
})

describe('loadWeekEntries', () => {
  it('filters by user_id and keeps Sunday while dropping the following Monday', async () => {
    const calls: { table: string; method: string; args: unknown[] }[] = []
    const rows = {
      expenses: [
        { user_id: 'u1', date: '2026-10-18', category: 'Food', amount: 10 },
        { user_id: 'u1', date: '2026-10-19', category: 'Rent', amount: 999 },
        { user_id: 'stranger', date: '2026-10-18', category: 'Rent', amount: 888 },
      ],
      income_records: [
        { user_id: 'u1', date: '2026-10-18' },
        { user_id: 'u1', date: '2026-10-19' },
      ],
    }
    const admin = {
      from(table: string) {
        const builder = {
          select: (...args: unknown[]) => {
            calls.push({ table, method: 'select', args })
            return builder
          },
          in: (...args: unknown[]) => {
            calls.push({ table, method: 'in', args })
            return builder
          },
          gte: (...args: unknown[]) => {
            calls.push({ table, method: 'gte', args })
            return builder
          },
          lte: (...args: unknown[]) => {
            calls.push({ table, method: 'lte', args })
            return builder
          },
          order: () => builder,
          range: async () => ({ data: rows[table as 'expenses' | 'income_records'] ?? [], error: null }),
        }
        return builder
      },
    }
    const entries = await loadWeekEntries(admin as unknown as SupabaseClient, ['u1'], WINDOW)
    expect(entries.map((entry) => `${entry.kind}:${entry.date}`).sort()).toEqual(['expense:2026-10-18', 'income:2026-10-18'])
    expect(entries.some((entry) => entry.userId !== 'u1')).toBe(false)

    expect(calls.filter((call) => call.method === 'in').map((call) => call.args)).toEqual([
      ['user_id', ['u1']],
      ['user_id', ['u1']],
    ])
    const bounds = calls.filter((call) => call.method === 'gte' || call.method === 'lte')
    expect(bounds).toEqual([
      { table: 'expenses', method: 'gte', args: ['date', '2026-10-05'] },
      { table: 'expenses', method: 'lte', args: ['date', '2026-10-18'] },
      { table: 'income_records', method: 'gte', args: ['date', '2026-10-12'] },
      { table: 'income_records', method: 'lte', args: ['date', '2026-10-18'] },
    ])
    expect(calls.every((call) => call.table === 'expenses' || call.table === 'income_records')).toBe(true)
  })

  it('does not query when nobody is eligible', async () => {
    const admin = { from: () => { throw new Error('should not query') } }
    expect(await loadWeekEntries(admin as unknown as SupabaseClient, [], WINDOW)).toEqual([])
  })
})

describe('sendWeeklySummaryTest', () => {
  const env = {
    RESEND_API_KEY: 're_test',
    MARKETING_UNSUBSCRIBE_SECRET: 'u'.repeat(40),
    MARKETING_TEST_EMAIL: 'Founder@Example.com',
    NEXT_PUBLIC_APP_URL: 'https://klaroph.com',
  }

  it('sends one [TEST] message to MARKETING_TEST_EMAIL and nowhere else', async () => {
    const sendBatch = vi.fn().mockResolvedValue({ ok: true, ids: ['e-test'] })
    const result = await sendWeeklySummaryTest(NOW, { env, sendBatch })
    expect(result).toEqual({ status: 200, body: { ok: true, mode: 'test' } })
    expect(sendBatch).toHaveBeenCalledTimes(1)
    const messages = sendBatch.mock.calls[0][1]
    expect(messages.map((message: { to: string }) => message.to)).toEqual(['founder@example.com'])
    expect(messages[0].subject).toBe('[TEST] Your week in KlaroPH')
    expect(messages[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const oneClick = messages[0].headers['List-Unsubscribe'].match(/^<(.+)>$/)?.[1] ?? ''
    const token = decodeURIComponent(new URL(oneClick).searchParams.get('token') ?? '')
    expect(verifyUnsubscribeToken(token, env.MARKETING_UNSUBSCRIBE_SECRET)).toBe('00000000-0000-0000-0000-000000000000')
    expect(JSON.stringify(result.body)).not.toContain('founder@example.com')
  })

  it('refuses when the test inbox is not configured', async () => {
    const sendBatch = vi.fn()
    const result = await sendWeeklySummaryTest(NOW, { env: { ...env, MARKETING_TEST_EMAIL: '' }, sendBatch })
    expect(result.status).toBe(400)
    expect(sendBatch).not.toHaveBeenCalled()
  })
})
