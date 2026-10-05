import { describe, expect, it, vi } from 'vitest'
import { wipeUserAccount, type AccountWipeStore } from './accountWipe'

const USER = '22222222-2222-4222-8222-222222222222'

function store(): AccountWipeStore {
  return {
    deleteUnlinkedRows: vi.fn(async () => {}),
    deleteAuthUser: vi.fn(async () => {}),
  }
}

describe('wipeUserAccount', () => {
  it('removes unlinked rows before the auth user', async () => {
    const db = store()
    await wipeUserAccount(db, USER)
    expect(db.deleteUnlinkedRows).toHaveBeenCalledWith(USER)
    expect(db.deleteAuthUser).toHaveBeenCalledWith(USER)
    const order = [
      vi.mocked(db.deleteUnlinkedRows).mock.invocationCallOrder[0],
      vi.mocked(db.deleteAuthUser).mock.invocationCallOrder[0],
    ]
    expect(order[0]).toBeLessThan(order[1])
  })

  it('does not delete the auth user when unlinked cleanup fails, so cascaded data stays', async () => {
    const db = store()
    vi.mocked(db.deleteUnlinkedRows).mockRejectedValueOnce(new Error('premium_confirmation_emails: timeout'))
    await expect(wipeUserAccount(db, USER)).rejects.toThrow(/premium_confirmation_emails/)
    expect(db.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('propagates an auth-delete failure instead of reporting success', async () => {
    const db = store()
    vi.mocked(db.deleteAuthUser).mockRejectedValueOnce(new Error('auth user: database error'))
    await expect(wipeUserAccount(db, USER)).rejects.toThrow(/auth user/)
    expect(db.deleteUnlinkedRows).toHaveBeenCalledWith(USER)
  })
})
