import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getFounderUser, sendTransactionalEmail, adminFrom } = vi.hoisted(() => ({
  getFounderUser: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  adminFrom: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/founder/access', () => ({ getFounderUser }))
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: adminFrom, auth: { admin: {} } } }))
vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/resend')>()),
  sendTransactionalEmail,
}))

import { sendEmailSampleAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  vi.stubEnv('MARKETING_TEST_EMAIL', 'test-inbox@example.com')
  getFounderUser.mockResolvedValue({ id: 'founder' })
  sendTransactionalEmail.mockResolvedValue({ ok: true, id: 're_123' })
})

describe('sendEmailSampleAction', () => {
  it('requires the founder session', async () => {
    getFounderUser.mockResolvedValue(null)
    expect(await sendEmailSampleAction('paid')).toEqual({ ok: false, message: 'Not authorized.' })
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('sends the chosen sample to MARKETING_TEST_EMAIL via the shared Resend helper', async () => {
    const result = await sendEmailSampleAction('complimentary')
    expect(result).toEqual({ ok: true, message: 'Sample accepted by Resend (re_123). Check the test inbox.' })
    const [, message, key] = sendTransactionalEmail.mock.calls[0]
    expect(message.to).toBe('test-inbox@example.com')
    expect(message.subject).toBe('[TEST] You’ve got KlaroPH Pro — on us')
    expect(key).toMatch(/^email-sample-complimentary-/)
  })

  it('ignores any recipient or account the browser tries to pass', async () => {
    const call = sendEmailSampleAction as unknown as (kind: string, extra: unknown) => ReturnType<typeof sendEmailSampleAction>
    await call('paid', { to: 'victim@example.com', userId: 'u1', subscriptionId: 's1' })
    expect(sendTransactionalEmail.mock.calls[0][1].to).toBe('test-inbox@example.com')
  })

  it('never touches the database (subscriptions, profiles, marketing_email_sends, premium_confirmation_emails)', async () => {
    await sendEmailSampleAction('paid')
    await sendEmailSampleAction('complimentary')
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('refuses without a configured test inbox or Resend key', async () => {
    vi.stubEnv('MARKETING_TEST_EMAIL', '')
    expect(await sendEmailSampleAction('paid')).toEqual({ ok: false, message: 'MARKETING_TEST_EMAIL is not configured.' })
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await sendEmailSampleAction('paid')).toMatchObject({ ok: false })
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })
})
