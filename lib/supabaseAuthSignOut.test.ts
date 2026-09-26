import { afterEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn(async () => ({ error: null }))

vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { signOut } } }))

const { signOutWithFullCleanup } = await import('./supabaseAuthSignOut')

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
    keys: () => Array.from(data.keys()),
  }
}

afterEach(() => {
  signOut.mockClear()
  vi.unstubAllGlobals()
})

describe('signOutWithFullCleanup', () => {
  it('normal logout ends only the current device session', async () => {
    await signOutWithFullCleanup('local')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('account deletion revokes every session', async () => {
    await signOutWithFullCleanup('global')
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('clears sb-* browser storage keys and keeps unrelated app keys', async () => {
    const localStorage = memoryStorage({ 'sb-ref-auth-token': 'x', klaro_promo: 'keep' })
    const sessionStorage = memoryStorage({ 'sb-ref-code-verifier': 'y' })
    vi.stubGlobal('window', { localStorage, sessionStorage })

    await signOutWithFullCleanup('local')

    expect(localStorage.keys()).toEqual(['klaro_promo'])
    expect(sessionStorage.keys()).toEqual([])
  })
})
