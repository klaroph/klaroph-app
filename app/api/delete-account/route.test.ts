import { readFileSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'juan@example.com' }

const state = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  sessionError: null as { message: string } | null,
  deleteUnlinkedRows: vi.fn(async () => {}),
  deleteAuthUser: vi.fn(async () => {}),
  sendAccountDeletedEmail: vi.fn(async () => true),
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.sessionError }),
    },
  }),
}))

vi.mock('@/lib/founder/userActionsData', () => ({
  supabaseUserActionStore: {
    deleteUnlinkedRows: (userId: string) => state.deleteUnlinkedRows(userId),
    deleteAuthUser: (userId: string) => state.deleteAuthUser(userId),
  },
}))

vi.mock('@/lib/accountDeletedEmail', () => ({
  sendAccountDeletedEmail: (email: string) => state.sendAccountDeletedEmail(email),
}))

import { POST } from './route'

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/delete-account', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.user = { ...USER }
  state.sessionError = null
  state.deleteUnlinkedRows.mockReset()
  state.deleteAuthUser.mockReset()
  state.sendAccountDeletedEmail.mockReset()
  state.deleteUnlinkedRows.mockResolvedValue(undefined)
  state.deleteAuthUser.mockResolvedValue(undefined)
  state.sendAccountDeletedEmail.mockResolvedValue(true)
})

describe('POST /api/delete-account', () => {
  it('requires a valid session and does not wipe', async () => {
    state.user = null
    expect((await post({ email: USER.email })).status).toBe(401)

    state.user = { ...USER }
    state.sessionError = { message: 'expired' }
    expect((await post({ email: USER.email })).status).toBe(401)

    state.sessionError = null
    state.user = { id: USER.id }
    expect((await post({ email: USER.email })).status).toBe(401)

    expect(state.deleteUnlinkedRows).not.toHaveBeenCalled()
    expect(state.deleteAuthUser).not.toHaveBeenCalled()
    expect(state.sendAccountDeletedEmail).not.toHaveBeenCalled()
  })

  it('rejects a mismatched email before any delete', async () => {
    const res = await post({ email: 'other@example.com' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Email does not match your account.' })
    expect(state.deleteUnlinkedRows).not.toHaveBeenCalled()
    expect(state.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('rejects an invalid body before any delete', async () => {
    const res = await post('{')
    expect(res.status).toBe(400)
    expect(state.deleteUnlinkedRows).not.toHaveBeenCalled()
  })

  it('wipes through the shared helper, then sends the confirmation email', async () => {
    const res = await post({ email: USER.email })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.deleteUnlinkedRows).toHaveBeenCalledWith(USER.id)
    expect(state.deleteAuthUser).toHaveBeenCalledWith(USER.id)
    expect(state.sendAccountDeletedEmail).toHaveBeenCalledWith(USER.email)
    const order = [
      state.deleteUnlinkedRows.mock.invocationCallOrder[0],
      state.deleteAuthUser.mock.invocationCallOrder[0],
      state.sendAccountDeletedEmail.mock.invocationCallOrder[0],
    ]
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[2])
  })

  it('returns 500 and leaves the auth user when unlinked cleanup fails', async () => {
    state.deleteUnlinkedRows.mockRejectedValueOnce(new Error('premium_confirmation_emails: timeout'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ email: USER.email })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Failed to delete account data. Please try again or contact support.',
    })
    expect(state.deleteAuthUser).not.toHaveBeenCalled()
    expect(state.sendAccountDeletedEmail).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it('returns 500 without a deleted-account email when the auth delete fails', async () => {
    state.deleteAuthUser.mockRejectedValueOnce(new Error('auth user: database error'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ email: USER.email })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to delete account data. Please try again or contact support.')
    expect(body.error).not.toMatch(/removed/i)
    expect(state.deleteUnlinkedRows).toHaveBeenCalledWith(USER.id)
    expect(state.sendAccountDeletedEmail).not.toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it('still reports success when the confirmation email cannot be sent after a full wipe', async () => {
    state.sendAccountDeletedEmail.mockResolvedValue(false)
    const res = await post({ email: USER.email })
    expect(res.status).toBe(200)
    expect(state.deleteAuthUser).toHaveBeenCalledWith(USER.id)
  })

  it('does not delete child tables itself', () => {
    const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
    expect(src).toContain('wipeUserAccount')
    expect(src).not.toMatch(/from\(['"]expenses['"]\)/)
    expect(src).not.toMatch(/from\(['"]profiles['"]\)/)
    expect(src).not.toMatch(/Account data was removed/)
  })
})
