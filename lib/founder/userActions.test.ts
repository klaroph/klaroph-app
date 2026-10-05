import { describe, expect, it, vi } from 'vitest'
import {
  deleteUserAccount,
  grantComplimentaryPro,
  type GrantRow,
  type TargetAccount,
  type TargetSubscription,
  type UserActionMailer,
  type UserActionStore,
} from './userActions'
import { buildFounderUsers, planKind, summarizeUsers } from './metrics'
import { DELETE_CONFIRMATION_PHRASE } from './userList'

const NOW = new Date('2026-09-26T04:00:00Z')
const FOUNDER = { id: '11111111-1111-4111-8111-111111111111', email: 'founder@klaroph.test' }
const TARGET = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const TESTER = '44444444-4444-4444-8444-444444444444'
const PRO_PLAN = 'plan-pro'
const FREE_PLAN = 'plan-free'
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

const freeSub = (over: Partial<TargetSubscription> = {}): TargetSubscription => ({
  id: 'sub-1',
  user_id: TARGET,
  plan_id: FREE_PLAN,
  plan_name: 'free',
  status: 'active',
  current_period_end: daysFromNow(200),
  grace_period_until: null,
  auto_renew: false,
  is_lifetime: false,
  payment_provider: 'manual',
  plan_type: 'free',
  ...over,
})

function grantStore(account: TargetAccount | null, conflict = false) {
  const writes: { expected: TargetSubscription | null; row: GrantRow }[] = []
  const store: UserActionStore = {
    getAccount: vi.fn(async (id) => (account && account.id === id ? account : null)),
    getProPlanId: vi.fn(async () => PRO_PLAN),
    applyGrant: vi.fn(async (_userId, expected, row) => {
      if (conflict) return 'conflict' as const
      writes.push({ expected, row })
      return 'applied' as const
    }),
    deleteUnlinkedRows: vi.fn(async () => {}),
    deleteAuthUser: vi.fn(async () => {}),
  }
  return { store, writes }
}

const account = (over: Partial<TargetAccount> = {}): TargetAccount => ({
  id: TARGET,
  email: 'Juan@Example.com',
  nickname: null,
  full_name: 'Juan Dela Cruz',
  subscription: freeSub(),
  ...over,
})

const okMail = () => vi.fn<UserActionMailer>(async () => ({ ok: true, id: 'resend-1' }))

describe('grantComplimentaryPro', () => {
  it('writes canonical complimentary Pro (pro plan, manual provider, fixed end) and emails the stored address', async () => {
    const { store, writes } = grantStore(account())
    const mail = okMail()
    const result = await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '3m' })

    expect(result).toEqual({ ok: true, message: 'Complimentary Pro granted until December 26, 2026. The user has been emailed.' })
    expect(writes).toHaveLength(1)
    const { row, expected } = writes[0]
    expect(expected).toMatchObject({ id: 'sub-1', plan_id: FREE_PLAN })
    expect(row).toEqual({
      plan_id: PRO_PLAN,
      status: 'active',
      plan_type: 'monthly',
      payment_provider: 'manual',
      current_period_start: NOW.toISOString(),
      current_period_end: '2026-12-26T04:00:00.000Z',
      grace_period_until: null,
      grace_period_used: false,
      auto_renew: false,
      is_lifetime: false,
      paymongo_checkout_session_id: null,
    })
    expect(planKind({ ...row, user_id: TARGET, plan_name: 'pro' }, NOW)).toBe('complimentary')

    const [message, key] = mail.mock.calls[0]
    expect(message.to).toBe('juan@example.com')
    expect(message.text).toContain('Hi Juan,')
    expect(message.text).toContain('Active until: December 26, 2026')
    expect(message.subject).not.toMatch(/\[TEST\]/)
    expect(key).toBe(`complimentary-pro-${TARGET}-${NOW.toISOString()}`)
  })

  it('uses an annual row for one year', async () => {
    const { store, writes } = grantStore(account())
    await grantComplimentaryPro({ store, mail: okMail(), now: NOW }, { userId: TARGET, duration: '12m' })
    expect(writes[0].row).toMatchObject({ plan_type: 'annual', current_period_end: '2027-09-26T04:00:00.000Z' })
  })

  it('ignores any email or plan the browser tries to supply', async () => {
    const { store, writes } = grantStore(account())
    const mail = okMail()
    await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '1m', email: 'attacker@evil.test', is_lifetime: true } as never)
    expect(mail.mock.calls[0][0].to).toBe('juan@example.com')
    expect(writes[0].row.is_lifetime).toBe(false)
  })

  it('refuses users who already have Pro — paid, lifetime, complimentary or in grace — without writing or emailing', async () => {
    const proSubs = [
      freeSub({ plan_id: PRO_PLAN, plan_name: 'pro', payment_provider: 'paymongo', plan_type: 'monthly' }),
      freeSub({ plan_id: PRO_PLAN, plan_name: 'pro', is_lifetime: true, current_period_end: daysFromNow(-90) }),
      freeSub({ plan_id: PRO_PLAN, plan_name: 'pro', plan_type: 'monthly' }),
      freeSub({ plan_id: PRO_PLAN, plan_name: 'pro', status: 'past_due', current_period_end: daysFromNow(-1), grace_period_until: daysFromNow(2) }),
    ]
    for (const subscription of proSubs) {
      const { store } = grantStore(account({ subscription }))
      const mail = okMail()
      expect(await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '3m' })).toEqual({
        ok: false,
        message: 'This user already has Pro. Nothing was changed.',
      })
      expect(store.applyGrant).not.toHaveBeenCalled()
      expect(mail).not.toHaveBeenCalled()
    }
  })

  it('grants to a user whose Pro has expired', async () => {
    const expired = freeSub({ plan_id: PRO_PLAN, plan_name: 'pro', payment_provider: 'paymongo', current_period_end: daysFromNow(-3) })
    const { store, writes } = grantStore(account({ subscription: expired }))
    expect((await grantComplimentaryPro({ store, mail: okMail(), now: NOW }, { userId: TARGET, duration: '1m' })).ok).toBe(true)
    expect(writes[0].expected).toBe(expired)
  })

  it('keeps the grant and reports it when the notification email fails', async () => {
    const { store, writes } = grantStore(account())
    const mail = vi.fn<UserActionMailer>(async () => ({ ok: false, error: 'rate limited' }))
    const result = await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '3m' })
    expect(result).toMatchObject({ ok: true, warning: true })
    expect(result.message).toContain('Complimentary Pro granted')
    expect(result.message).toContain('could not be sent')
    expect(writes).toHaveLength(1)
  })

  it('grants without emailing when the account has no valid email', async () => {
    const { store } = grantStore(account({ email: null }))
    const mail = okMail()
    const result = await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '3m' })
    expect(result).toMatchObject({ ok: true, warning: true })
    expect(mail).not.toHaveBeenCalled()
  })

  it('does not email when the plan changed underneath the grant (duplicate protection)', async () => {
    const { store } = grantStore(account(), true)
    const mail = okMail()
    expect((await grantComplimentaryPro({ store, mail, now: NOW }, { userId: TARGET, duration: '3m' })).ok).toBe(false)
    expect(mail).not.toHaveBeenCalled()
  })

  it('rejects unknown users, malformed ids and unknown durations before writing', async () => {
    for (const input of [
      { userId: OTHER, duration: '3m' },
      { userId: 'not-a-uuid', duration: '3m' },
      { userId: TARGET, duration: 'lifetime' },
      { userId: TARGET, duration: undefined },
    ]) {
      const { store } = grantStore(account())
      expect((await grantComplimentaryPro({ store, mail: okMail(), now: NOW }, input)).ok).toBe(false)
      expect(store.applyGrant).not.toHaveBeenCalled()
    }
  })
})

// ------------------------------------------------------------------ deletion

/** Production foreign keys, audited 2026-09-26: user rows in these tables cascade from auth.users. */
const CASCADES_FROM_AUTH_USER = [
  'profiles',
  'subscriptions',
  'income_records',
  'expenses',
  'goals',
  'budget_plans',
  'budget_overrides',
  'financial_accounts',
  'voucher_redemptions',
  'klaro_ai_insights',
  'klaro_ai_usage',
  'klaro_ai_conversations',
  'klaro_ai_messages',
  'marketing_email_sends',
  'support_requests',
] as const
/** Cascade from a parent above: income_allocations (income_records, goals), support_request_messages (support_requests). */
const CASCADES_FROM_PARENT = ['income_allocations', 'support_request_messages'] as const
/** user_id with no foreign key — only an explicit delete removes these. */
const UNLINKED = ['premium_confirmation_emails'] as const
const GLOBAL = ['plans', 'vouchers', 'payment_events'] as const
const USER_TABLES = [...CASCADES_FROM_AUTH_USER, ...CASCADES_FROM_PARENT, ...UNLINKED]

type Row = { owner: string | null }

function fakeDatabase() {
  const auth = new Map<string, { id: string; email: string; email_confirmed_at: string; last_sign_in_at: string }>()
  const tables = new Map<string, Row[]>()
  const addUser = (id: string, email: string) => {
    auth.set(id, { id, email, email_confirmed_at: daysFromNow(-30), last_sign_in_at: daysFromNow(-1) })
    for (const t of USER_TABLES) tables.set(t, [...(tables.get(t) ?? []), { owner: id }, { owner: id }])
  }
  for (const t of GLOBAL) tables.set(t, [{ owner: null }, { owner: null }])
  addUser(TARGET, 'juan@example.com')
  addUser(OTHER, 'maria@example.com')
  addUser(TESTER, 'qa@example.com')
  addUser(FOUNDER.id, FOUNDER.email)

  const profileRow = (id: string) => ({
    id,
    full_name: auth.get(id)!.email.split('@')[0],
    nickname: null,
    user_type: id === TESTER ? 'tester' : 'user',
    created_at: daysFromNow(-30),
    marketing_emails_unsubscribed_at: null,
  })

  const store: UserActionStore = {
    getAccount: vi.fn(async (id) => {
      const user = auth.get(id)
      return user ? { id, email: user.email, nickname: null, full_name: null, subscription: null } : null
    }),
    getProPlanId: vi.fn(async () => PRO_PLAN),
    applyGrant: vi.fn(async () => 'applied' as const),
    deleteUnlinkedRows: vi.fn(async (id) => {
      for (const t of UNLINKED) tables.set(t, tables.get(t)!.filter((r) => r.owner !== id))
    }),
    deleteAuthUser: vi.fn(async (id) => {
      auth.delete(id)
      for (const t of [...CASCADES_FROM_AUTH_USER, ...CASCADES_FROM_PARENT]) tables.set(t, tables.get(t)!.filter((r) => r.owner !== id))
    }),
  }

  const founderUsers = () =>
    buildFounderUsers({
      authUsers: [...auth.values()],
      profiles: [...auth.keys()].filter((id) => tables.get('profiles')!.some((r) => r.owner === id)).map(profileRow),
      subscriptions: [],
      now: NOW,
    })

  return { store, tables, auth, founderUsers }
}

const confirm = (over: Record<string, unknown> = {}) => ({
  userId: TARGET,
  confirmEmail: 'juan@example.com',
  confirmPhrase: DELETE_CONFIRMATION_PHRASE,
  ...over,
})

function deps(store: UserActionStore, notifyDeleted = vi.fn(async () => true)) {
  return { store, founder: FOUNDER, founderEmail: FOUNDER.email, notifyDeleted }
}

describe('deleteUserAccount', () => {
  it('removes every user-scoped row for the target and nothing else', async () => {
    const db = fakeDatabase()
    const before = new Map([...db.tables].map(([t, rows]) => [t, rows.length]))
    const result = await deleteUserAccount(deps(db.store), confirm())

    expect(result).toEqual({ ok: true, message: 'juan@example.com and their KlaroPH data were permanently deleted. A confirmation email was sent.' })
    for (const t of USER_TABLES) {
      expect(db.tables.get(t)!.filter((r) => r.owner === TARGET), t).toEqual([])
      expect(db.tables.get(t)!.length, t).toBe(before.get(t)! - 2)
    }
    for (const t of GLOBAL) expect(db.tables.get(t), t).toHaveLength(2)
    expect(db.auth.has(TARGET)).toBe(false)
    expect([...db.auth.keys()].sort()).toEqual([FOUNDER.id, OTHER, TESTER].sort())
  })

  it('deletes unlinked rows before the auth user, so a failure never leaves orphans behind', async () => {
    const db = fakeDatabase()
    await deleteUserAccount(deps(db.store), confirm())
    const order = [vi.mocked(db.store.deleteUnlinkedRows).mock.invocationCallOrder[0], vi.mocked(db.store.deleteAuthUser).mock.invocationCallOrder[0]]
    expect(order[0]).toBeLessThan(order[1])
  })

  it('stops before the auth user when unlinked cleanup fails, and does not send the deleted email', async () => {
    const db = fakeDatabase()
    const notifyDeleted = vi.fn(async () => true)
    vi.mocked(db.store.deleteUnlinkedRows).mockRejectedValueOnce(new Error('premium_confirmation_emails: timeout'))
    await expect(deleteUserAccount(deps(db.store, notifyDeleted), confirm())).rejects.toThrow(/premium_confirmation_emails/)
    expect(db.store.deleteAuthUser).not.toHaveBeenCalled()
    expect(notifyDeleted).not.toHaveBeenCalled()
    expect(db.auth.has(TARGET)).toBe(true)
  })

  it('removes the user from Founder Users data and counts, leaving testers separate', async () => {
    const db = fakeDatabase()
    expect(summarizeUsers(db.founderUsers()).total).toBe(3)
    await deleteUserAccount(deps(db.store), confirm())
    const users = db.founderUsers()
    expect(users.map((u) => u.id)).not.toContain(TARGET)
    expect(summarizeUsers(users).total).toBe(2)

    await deleteUserAccount(deps(db.store), confirm({ userId: TESTER, confirmEmail: 'qa@example.com' }))
    expect(summarizeUsers(db.founderUsers()).total).toBe(2)
  })

  it('never deletes the founder account, by id or by configured founder email', async () => {
    const db = fakeDatabase()
    expect(await deleteUserAccount(deps(db.store), confirm({ userId: FOUNDER.id, confirmEmail: FOUNDER.email }))).toEqual({
      ok: false,
      message: 'The founder account cannot be deleted from Mission Control.',
    })
    const otherSession = { ...deps(db.store), founder: { id: OTHER, email: 'maria@example.com' } }
    expect((await deleteUserAccount(otherSession, confirm({ userId: FOUNDER.id, confirmEmail: FOUNDER.email }))).ok).toBe(false)
    expect(db.store.deleteAuthUser).not.toHaveBeenCalled()
    expect(db.auth.has(FOUNDER.id)).toBe(true)
  })

  it('rejects a wrong confirmation email, including one for a different real user', async () => {
    for (const confirmEmail of ['juan@exampl.com', 'maria@example.com', '', undefined, 42]) {
      const db = fakeDatabase()
      expect((await deleteUserAccount(deps(db.store), confirm({ confirmEmail }))).message).toBe("The email you typed does not match this user's account.")
      expect(db.store.deleteAuthUser).not.toHaveBeenCalled()
    }
  })

  it('accepts the account email regardless of case or surrounding spaces', async () => {
    const db = fakeDatabase()
    expect((await deleteUserAccount(deps(db.store), confirm({ confirmEmail: '  JUAN@example.com ' }))).ok).toBe(true)
  })

  it('rejects a wrong or missing confirmation phrase before loading the account', async () => {
    for (const confirmPhrase of ['delete user', 'DELETE', '', undefined]) {
      const db = fakeDatabase()
      expect((await deleteUserAccount(deps(db.store), confirm({ confirmPhrase }))).ok).toBe(false)
      expect(db.store.getAccount).not.toHaveBeenCalled()
      expect(db.store.deleteAuthUser).not.toHaveBeenCalled()
    }
  })

  it('rejects nonexistent users and malformed ids safely', async () => {
    for (const userId of ['55555555-5555-4555-8555-555555555555', 'not-a-uuid', undefined]) {
      const db = fakeDatabase()
      expect(await deleteUserAccount(deps(db.store), confirm({ userId }))).toEqual({ ok: false, message: 'User not found. Refresh and try again.' })
      expect(db.store.deleteAuthUser).not.toHaveBeenCalled()
    }
  })

  it('still reports the deletion when the confirmation email cannot be sent', async () => {
    const db = fakeDatabase()
    const result = await deleteUserAccount(deps(db.store, vi.fn(async () => false)), confirm())
    expect(result).toMatchObject({ ok: true, warning: true })
    expect(db.auth.has(TARGET)).toBe(false)
  })
})
