import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getFounderUser, store, sendTransactionalEmail, sendAccountDeletedEmail } = vi.hoisted(() => ({
  getFounderUser: vi.fn(),
  store: {
    getAccount: vi.fn(),
    getProPlanId: vi.fn(),
    applyGrant: vi.fn(),
    deleteUnlinkedRows: vi.fn(),
    deleteAuthUser: vi.fn(),
  },
  sendTransactionalEmail: vi.fn(),
  sendAccountDeletedEmail: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/founder/access', () => ({ getFounderUser }))
vi.mock('@/lib/founder/userActionsData', () => ({ supabaseUserActionStore: store }))
vi.mock('@/lib/accountDeletedEmail', () => ({ sendAccountDeletedEmail }))
vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/resend')>()),
  sendTransactionalEmail,
}))

import { deleteUserAction, grantComplimentaryProAction } from './actions'

const FOUNDER = { id: '11111111-1111-4111-8111-111111111111', email: 'founder@klaroph.test' }
const TARGET = '22222222-2222-4222-8222-222222222222'
const account = {
  id: TARGET,
  email: 'juan@example.com',
  nickname: null,
  full_name: 'Juan Dela Cruz',
  subscription: null,
}
const deleteInput = { userId: TARGET, confirmEmail: 'juan@example.com', confirmPhrase: 'DELETE USER' }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('user actions — founder authorization', () => {
  it('non-founders cannot grant Pro: nothing is read, written or emailed', async () => {
    getFounderUser.mockResolvedValue(null)
    expect(await grantComplimentaryProAction({ userId: TARGET, duration: '3m' })).toEqual({ ok: false, message: 'Not authorized.' })
    expect(store.getAccount).not.toHaveBeenCalled()
    expect(store.applyGrant).not.toHaveBeenCalled()
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('non-founders cannot delete: nothing is read or deleted', async () => {
    getFounderUser.mockResolvedValue(null)
    expect(await deleteUserAction(deleteInput)).toEqual({ ok: false, message: 'Not authorized.' })
    expect(store.getAccount).not.toHaveBeenCalled()
    expect(store.deleteUnlinkedRows).not.toHaveBeenCalled()
    expect(store.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('the founder grants Pro through the transactional Resend helper, never the marketing pipeline', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    getFounderUser.mockResolvedValue(FOUNDER)
    store.getAccount.mockResolvedValue(account)
    store.getProPlanId.mockResolvedValue('plan-pro')
    store.applyGrant.mockResolvedValue('applied')
    sendTransactionalEmail.mockResolvedValue({ ok: true, id: 'resend-1' })

    const result = await grantComplimentaryProAction({ userId: TARGET, duration: '3m' })
    expect(result.ok).toBe(true)
    expect(store.applyGrant).toHaveBeenCalledWith(TARGET, null, expect.objectContaining({ payment_provider: 'manual', plan_id: 'plan-pro' }))
    const [config, message, key] = sendTransactionalEmail.mock.calls[0]
    expect(config).toMatchObject({ apiKey: 're_test' })
    expect(message.to).toBe('juan@example.com')
    expect(message.html).not.toMatch(/unsubscribe/i)
    expect(key).toMatch(/^complimentary-pro-/)
  })

  it('keeps the grant when Resend is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    getFounderUser.mockResolvedValue(FOUNDER)
    store.getAccount.mockResolvedValue(account)
    store.getProPlanId.mockResolvedValue('plan-pro')
    store.applyGrant.mockResolvedValue('applied')
    expect(await grantComplimentaryProAction({ userId: TARGET, duration: '3m' })).toMatchObject({ ok: true, warning: true })
    expect(sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('the founder reaches the deletion service once every confirmation matches', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER.email)
    getFounderUser.mockResolvedValue(FOUNDER)
    store.getAccount.mockResolvedValue(account)
    sendAccountDeletedEmail.mockResolvedValue(true)

    expect((await deleteUserAction(deleteInput)).ok).toBe(true)
    expect(store.deleteUnlinkedRows).toHaveBeenCalledWith(TARGET)
    expect(store.deleteAuthUser).toHaveBeenCalledWith(TARGET)
    expect(sendAccountDeletedEmail).toHaveBeenCalledWith('juan@example.com')
  })

  it('refuses to delete the configured founder account even when the session belongs to someone else', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER.email)
    getFounderUser.mockResolvedValue({ id: 'another-founder-session', email: 'other@klaroph.test' })
    store.getAccount.mockResolvedValue({ ...account, id: FOUNDER.id, email: FOUNDER.email })
    const result = await deleteUserAction({ userId: FOUNDER.id, confirmEmail: FOUNDER.email, confirmPhrase: 'DELETE USER' })
    expect(result.ok).toBe(false)
    expect(store.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('reports a safe error when storage fails, without leaking details', async () => {
    getFounderUser.mockResolvedValue(FOUNDER)
    store.getAccount.mockRejectedValue(new Error('connection refused at db.internal:5432'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await deleteUserAction(deleteInput)
    expect(result).toEqual({ ok: false, message: 'Something went wrong. Refresh to see the current state, then try again.' })
    errorLog.mockRestore()
  })
})

describe('user actions — service role stays on the server', () => {
  const ROOT = path.resolve(__dirname, '../../../..')
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sources(full)
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })

  it('no client component imports the service-role client or the user action services', () => {
    const offenders = ['app', 'components', 'lib', 'hooks']
      .flatMap((d) => sources(path.join(ROOT, d)))
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return /^\s*['"]use client['"]/.test(src) && /@\/lib\/(supabaseAdmin|founder\/userActions(Data)?)['"]/.test(src)
      })
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('the service-role store and actions module are server-only', () => {
    expect(readFileSync(path.join(ROOT, 'app/admin/founder/users/actions.ts'), 'utf8')).toMatch(/^'use server'/)
    expect(readFileSync(path.join(ROOT, 'lib/founder/userActionsData.ts'), 'utf8')).not.toMatch(/use client/)
  })
})
