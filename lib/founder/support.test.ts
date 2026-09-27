import { describe, expect, it, vi } from 'vitest'
import {
  buildSupportThreads,
  filterSupportThreads,
  isStalePending,
  sendSupportReply,
  setSupportStatus,
  sortSupportThreads,
  SUPPORT_PENDING_STALE_MS,
  SUPPORT_REPLY_MAX,
  validateReplyBody,
  type SupportMailer,
  type SupportRequestRecord,
  type SupportRequestRow,
  type SupportStore,
} from './support'

const NOW = new Date('2026-09-27T00:00:00Z')
const FOUNDER = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const REPLY_ID = '33333333-3333-4333-8333-333333333333'
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function row(over: Partial<SupportRequestRow> = {}): SupportRequestRow {
  return {
    id: REQUEST_ID,
    user_id: 'u1',
    email: 'maria@example.com',
    subject: 'Payment issue',
    message: 'I was charged but Pro is not showing.',
    status: 'open',
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
    resolved_at: null,
    ...over,
  }
}

type StoredReply = { id: string; support_request_id: string; body: string; delivery_status: string; created_at: string; email_message_id?: string }
const STORED_BODY = 'Hi Maria, I checked your account.'
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const pendingReply = (createdAt: string): StoredReply => ({ id: REPLY_ID, support_request_id: REQUEST_ID, body: STORED_BODY, delivery_status: 'pending', created_at: createdAt })

function fakeStore(request: SupportRequestRecord | null = { ...row(), requester: { nickname: null, full_name: 'Maria Santos' }, accountEmail: 'maria@example.com' }) {
  const replies = new Map<string, StoredReply>()
  const store: SupportStore = {
    getRequest: vi.fn(async (id) => (request && request.id === id ? request : null)),
    claimReply: vi.fn(async (reply) => {
      if (replies.has(reply.id)) return 'exists' as const
      replies.set(reply.id, { ...reply, delivery_status: 'pending', created_at: NOW.toISOString() })
      return 'claimed' as const
    }),
    getReply: vi.fn(async (id) => replies.get(id) ?? null),
    releaseStaleReply: vi.fn(async (id, staleBefore) => {
      const r = replies.get(id)
      if (r?.delivery_status === 'pending' && r.created_at < staleBefore) r.delivery_status = 'failed'
    }),
    retryFailedReply: vi.fn(async (id, attemptedAt) => {
      const r = replies.get(id)
      if (r?.delivery_status !== 'failed') return false
      r.delivery_status = 'pending'
      r.created_at = attemptedAt
      return true
    }),
    finishReply: vi.fn(async (id, patch) => {
      Object.assign(replies.get(id)!, patch)
    }),
    updateRequest: vi.fn(async () => {}),
  }
  return { store, replies }
}

const okMail = () => vi.fn<SupportMailer>(async () => ({ ok: true, id: 'resend-1' }))
const reply = (over: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID,
  replyId: REPLY_ID,
  body: '  Hi Maria, I checked your account.  ',
  resolveAfter: false,
  founderId: FOUNDER,
  ...over,
})

describe('validateReplyBody', () => {
  it('trims, rejects empty and oversized replies', () => {
    expect(validateReplyBody('  hello \n')).toEqual({ ok: true, body: 'hello' })
    expect(validateReplyBody('   ').ok).toBe(false)
    expect(validateReplyBody(undefined).ok).toBe(false)
    expect(validateReplyBody('x'.repeat(SUPPORT_REPLY_MAX)).ok).toBe(true)
    expect(validateReplyBody('x'.repeat(SUPPORT_REPLY_MAX + 1)).ok).toBe(false)
  })
})

describe('sendSupportReply', () => {
  it('sends through the mailer to the stored address and records the reply', async () => {
    const { store, replies } = fakeStore()
    const mail = okMail()
    const result = await sendSupportReply({ store, mail, now: NOW }, reply())

    expect(result).toEqual({ ok: true, message: 'Reply sent.' })
    expect(mail).toHaveBeenCalledTimes(1)
    const [message, key] = mail.mock.calls[0]
    expect(message.to).toBe('maria@example.com')
    expect(message.subject).toBe('Re: Payment issue')
    expect(message.text).toContain('Hi Maria,')
    expect(message.text).toContain('Hi Maria, I checked your account.')
    expect(key).toBe(`support-reply-${REPLY_ID}`)
    expect(replies.get(REPLY_ID)).toMatchObject({ body: 'Hi Maria, I checked your account.', delivery_status: 'sent', email_message_id: 'resend-1' })
    expect(store.updateRequest).toHaveBeenCalledWith(REQUEST_ID, {
      status: 'open',
      resolved_at: null,
      resolved_by: null,
      updated_at: NOW.toISOString(),
    })
  })

  it('ignores any recipient the browser tries to supply', async () => {
    const { store } = fakeStore()
    const mail = okMail()
    await sendSupportReply({ store, mail, now: NOW }, { ...reply(), to: 'attacker@evil.test', email: 'attacker@evil.test' } as never)
    expect(mail.mock.calls[0][0].to).toBe('maria@example.com')
  })

  it('falls back to the account email when the request has none', async () => {
    const { store } = fakeStore({ ...row({ email: null }), requester: null, accountEmail: 'Account@Example.com' })
    const mail = okMail()
    await sendSupportReply({ store, mail, now: NOW }, reply())
    expect(mail.mock.calls[0][0].to).toBe('account@example.com')
  })

  it('resolves after sending when asked', async () => {
    const { store } = fakeStore()
    const result = await sendSupportReply({ store, mail: okMail(), now: NOW }, reply({ resolveAfter: true }))
    expect(result.message).toBe('Reply sent and request resolved.')
    expect(store.updateRequest).toHaveBeenCalledWith(REQUEST_ID, expect.objectContaining({ status: 'resolved', resolved_by: FOUNDER }))
  })

  it('returns a safe not-found for missing or malformed request ids', async () => {
    for (const requestId of ['44444444-4444-4444-8444-444444444444', 'not-a-uuid', 42, undefined]) {
      const { store } = fakeStore()
      const mail = okMail()
      expect(await sendSupportReply({ store, mail, now: NOW }, reply({ requestId }))).toEqual({ ok: false, message: 'Support request not found.' })
      expect(mail).not.toHaveBeenCalled()
      expect(store.claimReply).not.toHaveBeenCalled()
    }
  })

  it('rejects empty and oversized replies before touching storage or email', async () => {
    for (const body of ['   ', 'x'.repeat(SUPPORT_REPLY_MAX + 1)]) {
      const { store } = fakeStore()
      const mail = okMail()
      expect((await sendSupportReply({ store, mail, now: NOW }, reply({ body }))).ok).toBe(false)
      expect(store.getRequest).not.toHaveBeenCalled()
      expect(mail).not.toHaveBeenCalled()
    }
  })

  it('refuses when the stored request has no valid email', async () => {
    const { store } = fakeStore({ ...row({ email: 'not-an-email' }), requester: null, accountEmail: null })
    const mail = okMail()
    expect((await sendSupportReply({ store, mail, now: NOW }, reply())).ok).toBe(false)
    expect(mail).not.toHaveBeenCalled()
  })

  it('does not mark the reply sent or change the request when Resend fails', async () => {
    const { store, replies } = fakeStore()
    const mail = vi.fn<SupportMailer>(async () => ({ ok: false, error: 'rate limited' }))
    const result = await sendSupportReply({ store, mail, now: NOW }, reply({ resolveAfter: true }))
    expect(result.ok).toBe(false)
    expect(replies.get(REPLY_ID)?.delivery_status).toBe('failed')
    expect(store.updateRequest).not.toHaveBeenCalled()
  })

  it('never emails twice for the same reply id', async () => {
    const { store } = fakeStore()
    const mail = okMail()
    await sendSupportReply({ store, mail, now: NOW }, reply())
    const again = await sendSupportReply({ store, mail, now: NOW }, reply())
    expect(again).toEqual({ ok: true, message: 'This reply was already sent.' })
    expect(mail).toHaveBeenCalledTimes(1)
  })

  it('blocks a concurrent duplicate while the first send is in flight', async () => {
    const { store, replies } = fakeStore()
    replies.set(REPLY_ID, pendingReply(minutesAgo(1)))
    const mail = okMail()
    const result = await sendSupportReply({ store, mail, now: NOW }, reply())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('already being sent')
    expect(mail).not.toHaveBeenCalled()
    expect(replies.get(REPLY_ID)).toMatchObject({ delivery_status: 'pending', created_at: minutesAgo(1) })
  })

  it('recovers a reply left pending by an interrupted send, reusing the same idempotency key', async () => {
    const { store, replies } = fakeStore()
    replies.set(REPLY_ID, pendingReply(minutesAgo(5)))
    const mail = okMail()
    expect(await sendSupportReply({ store, mail, now: NOW }, reply())).toEqual({ ok: true, message: 'Reply sent.' })
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][1]).toBe(`support-reply-${REPLY_ID}`)
    expect(replies.get(REPLY_ID)).toMatchObject({ delivery_status: 'sent', created_at: NOW.toISOString(), email_message_id: 'resend-1' })
  })

  it('lets only one of two simultaneous recoveries of a stale reply send', async () => {
    const { store, replies } = fakeStore()
    replies.set(REPLY_ID, pendingReply(minutesAgo(5)))
    const first = okMail()
    const second = okMail()
    const results = await Promise.all([
      sendSupportReply({ store, mail: first, now: NOW }, reply()),
      sendSupportReply({ store, mail: second, now: NOW }, reply()),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1)
  })

  it('does not recover a stale reply with different text', async () => {
    const { store, replies } = fakeStore()
    replies.set(REPLY_ID, pendingReply(minutesAgo(5)))
    const mail = okMail()
    expect((await sendSupportReply({ store, mail, now: NOW }, reply({ body: 'Different text' }))).ok).toBe(false)
    expect(mail).not.toHaveBeenCalled()
    expect(replies.get(REPLY_ID)?.delivery_status).toBe('pending')
  })

  it('retries a failed reply with the same id, but not with different text', async () => {
    const { store, replies } = fakeStore()
    await sendSupportReply({ store, mail: vi.fn<SupportMailer>(async () => ({ ok: false, error: 'down' })), now: NOW }, reply())

    const edited = okMail()
    expect((await sendSupportReply({ store, mail: edited, now: NOW }, reply({ body: 'Different text' }))).ok).toBe(false)
    expect(edited).not.toHaveBeenCalled()

    const retry = okMail()
    expect((await sendSupportReply({ store, mail: retry, now: NOW }, reply())).ok).toBe(true)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(replies.get(REPLY_ID)?.delivery_status).toBe('sent')
  })
})

describe('setSupportStatus', () => {
  it('resolves and reopens with server-side timestamps', async () => {
    const { store } = fakeStore()
    expect(await setSupportStatus({ store, now: NOW }, { requestId: REQUEST_ID, status: 'resolved', founderId: FOUNDER })).toEqual({
      ok: true,
      message: 'Request resolved.',
    })
    expect(store.updateRequest).toHaveBeenLastCalledWith(REQUEST_ID, {
      status: 'resolved',
      resolved_at: NOW.toISOString(),
      resolved_by: FOUNDER,
      updated_at: NOW.toISOString(),
    })

    const resolved = fakeStore({ ...row({ status: 'resolved', resolved_at: daysAgo(1) }), requester: null, accountEmail: null })
    expect((await setSupportStatus({ store: resolved.store, now: NOW }, { requestId: REQUEST_ID, status: 'open', founderId: FOUNDER })).message).toBe(
      'Request reopened.'
    )
    expect(resolved.store.updateRequest).toHaveBeenCalledWith(REQUEST_ID, expect.objectContaining({ status: 'open', resolved_at: null, resolved_by: null }))
  })

  it('rejects unknown statuses, missing requests and no-op transitions safely', async () => {
    const { store } = fakeStore()
    expect((await setSupportStatus({ store, now: NOW }, { requestId: REQUEST_ID, status: 'deleted', founderId: FOUNDER })).ok).toBe(false)
    expect((await setSupportStatus({ store, now: NOW }, { requestId: 'nope', status: 'resolved', founderId: FOUNDER })).message).toBe(
      'Support request not found.'
    )
    expect((await setSupportStatus({ store, now: NOW }, { requestId: REQUEST_ID, status: 'open', founderId: FOUNDER })).message).toBe('Already open.')
    expect(store.updateRequest).not.toHaveBeenCalled()
  })
})

describe('support list', () => {
  const threads = buildSupportThreads({
    requests: [
      row({ id: 'answered', subject: null, message: 'How do I export?\nMore detail', created_at: daysAgo(9), updated_at: daysAgo(1) }),
      row({ id: 'new', user_id: 'u2', email: 'juan@example.com', subject: 'Cannot upgrade', created_at: daysAgo(2), updated_at: daysAgo(2) }),
      row({ id: 'old', user_id: 't1', email: 'tester@example.com', created_at: daysAgo(20), updated_at: daysAgo(20) }),
      row({ id: 'done', status: 'resolved', created_at: daysAgo(30), updated_at: daysAgo(3) }),
    ],
    replies: [
      { id: 'r1', support_request_id: 'answered', body: 'Use Export CSV.', created_at: daysAgo(1), delivery_status: 'sent' },
      { id: 'r2', support_request_id: 'new', body: 'Looking into it.', created_at: daysAgo(1), delivery_status: 'pending' },
    ],
    profiles: [
      { id: 'u1', full_name: 'maria@example.com', nickname: null, user_type: 'user' },
      { id: 'u2', full_name: 'Juan Dela Cruz', nickname: null, user_type: 'user' },
      { id: 't1', full_name: 'QA', nickname: null, user_type: 'tester' },
    ],
  })

  it('builds titles, names and reply state without using emails as names', () => {
    const answered = threads.find((t) => t.id === 'answered')!
    expect(answered.title).toBe('How do I export?')
    expect(answered.name).toBeNull()
    expect(answered.awaitingReply).toBe(false)
    expect(answered.replies).toHaveLength(1)
    expect(answered.hasUnconfirmedReply).toBe(false)
    expect(threads.find((t) => t.id === 'old')!.isTester).toBe(true)
  })

  it('shows unconfirmed replies without counting them as answered', () => {
    const pending = threads.find((t) => t.id === 'new')!
    expect(pending.replies).toEqual([{ id: 'r2', body: 'Looking into it.', createdAt: daysAgo(1), delivery: 'pending' }])
    expect(pending.hasUnconfirmedReply).toBe(true)
    expect(pending.awaitingReply).toBe(true)
  })

  it('treats a pending reply as stale only after the recovery window', () => {
    expect(isStalePending(new Date(NOW.getTime() - SUPPORT_PENDING_STALE_MS + 1000).toISOString(), NOW)).toBe(false)
    expect(isStalePending(new Date(NOW.getTime() - SUPPORT_PENDING_STALE_MS).toISOString(), NOW)).toBe(true)
  })

  it('puts unanswered open requests first (oldest first), then answered, then resolved', () => {
    expect(sortSupportThreads(threads).map((t) => t.id)).toEqual(['old', 'new', 'answered', 'done'])
  })

  it('filters by status and searches name, email and message', () => {
    expect(filterSupportThreads(threads, 'open', '').map((t) => t.id).sort()).toEqual(['answered', 'new', 'old'])
    expect(filterSupportThreads(threads, 'resolved', '').map((t) => t.id)).toEqual(['done'])
    expect(filterSupportThreads(threads, 'all', 'juan').map((t) => t.id)).toEqual(['new'])
    expect(filterSupportThreads(threads, 'all', 'EXPORT').map((t) => t.id)).toEqual(['answered'])
  })
})
