import { afterEach, describe, expect, it, vi } from 'vitest'

const { getFounderUser, store, sendTransactionalEmail } = vi.hoisted(() => ({
  getFounderUser: vi.fn(),
  store: {
    getRequest: vi.fn(),
    claimReply: vi.fn(),
    getReply: vi.fn(),
    retryFailedReply: vi.fn(),
    finishReply: vi.fn(),
    updateRequest: vi.fn(),
  },
  sendTransactionalEmail: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/founder/access', () => ({ getFounderUser }))
vi.mock('@/lib/founder/supportData', () => ({ supabaseSupportStore: store }))
vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/resend')>()),
  sendTransactionalEmail,
}))

import { sendSupportReplyAction, setSupportStatusAction } from './actions'

const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const replyInput = { requestId: REQUEST_ID, replyId: '33333333-3333-4333-8333-333333333333', body: 'Hello', resolveAfter: false }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('support actions — founder authorization', () => {
  it('non-founders cannot reply: nothing is read, stored or emailed', async () => {
    getFounderUser.mockResolvedValue(null)
    expect(await sendSupportReplyAction(replyInput)).toEqual({ ok: false, message: 'Not authorized.' })
    expect(store.getRequest).not.toHaveBeenCalled()
    expect(store.claimReply).not.toHaveBeenCalled()
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('non-founders cannot resolve or reopen', async () => {
    getFounderUser.mockResolvedValue(null)
    expect(await setSupportStatusAction(REQUEST_ID, 'resolved')).toEqual({ ok: false, message: 'Not authorized.' })
    expect(await setSupportStatusAction(REQUEST_ID, 'open')).toEqual({ ok: false, message: 'Not authorized.' })
    expect(store.getRequest).not.toHaveBeenCalled()
    expect(store.updateRequest).not.toHaveBeenCalled()
  })

  it('founders reply through Resend using the server-side founder id', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    getFounderUser.mockResolvedValue({ id: 'founder-id', email: 'founder@example.com' })
    store.getRequest.mockResolvedValue({
      id: REQUEST_ID,
      user_id: 'u1',
      email: 'maria@example.com',
      subject: 'Help',
      message: 'Original',
      status: 'open',
      created_at: '2026-09-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
      resolved_at: null,
      requester: null,
      accountEmail: null,
    })
    store.claimReply.mockResolvedValue('claimed')
    sendTransactionalEmail.mockResolvedValue({ ok: true, id: 'resend-1' })

    expect(await sendSupportReplyAction(replyInput)).toEqual({ ok: true, message: 'Reply sent.' })
    expect(store.claimReply).toHaveBeenCalledWith(expect.objectContaining({ sender_user_id: 'founder-id', support_request_id: REQUEST_ID }))
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 're_test' }),
      expect.objectContaining({ to: 'maria@example.com' }),
      `support-reply-${replyInput.replyId}`
    )
  })

  it('reports a safe error when Resend is not configured, without recording a send', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    getFounderUser.mockResolvedValue({ id: 'founder-id', email: 'founder@example.com' })
    store.getRequest.mockResolvedValue({
      id: REQUEST_ID,
      user_id: null,
      email: 'maria@example.com',
      subject: null,
      message: 'Original',
      status: 'open',
      created_at: '2026-09-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
      resolved_at: null,
      requester: null,
      accountEmail: null,
    })
    store.claimReply.mockResolvedValue('claimed')

    const result = await sendSupportReplyAction(replyInput)
    expect(result.ok).toBe(false)
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
    expect(store.finishReply).toHaveBeenCalledWith(replyInput.replyId, { delivery_status: 'failed' })
    expect(store.updateRequest).not.toHaveBeenCalled()
  })
})
