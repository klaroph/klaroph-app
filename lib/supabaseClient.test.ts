import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type UserResult = { data: { user: { id: string } | null }; error: Error | null }

const getUser = vi.fn<() => Promise<UserResult>>()
const createBrowserClient = vi.fn(() => ({ auth: { getUser } }))

vi.mock('@supabase/ssr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/ssr')>()),
  createBrowserClient,
}))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ref.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
vi.spyOn(console, 'log').mockImplementation(() => {})

const { getBrowserUser } = await import('./supabaseClient')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  getUser.mockReset()
})

describe('browser Supabase client', () => {
  it('uses @supabase/ssr default cookie handling so password login persists like OAuth', async () => {
    expect(createBrowserClient).toHaveBeenCalledWith('https://ref.supabase.co', 'anon-key')
    const { DEFAULT_COOKIE_OPTIONS } = await vi.importActual<typeof import('@supabase/ssr')>('@supabase/ssr')
    expect(DEFAULT_COOKIE_OPTIONS.maxAge).toBeGreaterThan(0)
  })
})

describe('getBrowserUser', () => {
  it('shares one auth.getUser request across a burst of concurrent callers', async () => {
    const pending = deferred<UserResult>()
    getUser.mockReturnValueOnce(pending.promise)

    const calls = Array.from({ length: 12 }, () => getBrowserUser())
    pending.resolve({ data: { user: { id: 'user-1' } }, error: null })
    const results = await Promise.all(calls)

    expect(getUser).toHaveBeenCalledTimes(1)
    results.forEach((r) => expect(r.data.user?.id).toBe('user-1'))
  })

  it('makes a fresh request once the previous one has settled (no stale caching)', async () => {
    getUser
      .mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: null })

    expect((await getBrowserUser()).data.user?.id).toBe('user-1')
    expect((await getBrowserUser()).data.user).toBeNull()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('propagates a rejection to every waiter and allows a retry afterwards', async () => {
    const pending = deferred<UserResult>()
    getUser.mockReturnValueOnce(pending.promise)

    const a = getBrowserUser()
    const b = getBrowserUser()
    pending.reject(new Error('network'))
    await expect(a).rejects.toThrow('network')
    await expect(b).rejects.toThrow('network')

    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null })
    expect((await getBrowserUser()).data.user?.id).toBe('user-1')
    expect(getUser).toHaveBeenCalledTimes(2)
  })
})

describe('client code auth lock hygiene', () => {
  const root = path.resolve(__dirname, '..')
  const clientDirs = ['app', 'components', 'hooks', 'contexts']
  const serverOnly = [path.join('app', 'api'), path.join('app', 'auth')]

  function sourceFiles(dir: string): string[] {
    const abs = path.join(root, dir)
    let entries: string[]
    try {
      entries = readdirSync(abs)
    } catch {
      return []
    }
    return entries.flatMap((name) => {
      const rel = path.join(dir, name)
      if (serverOnly.some((s) => rel.startsWith(s))) return []
      if (statSync(path.join(root, rel)).isDirectory()) return sourceFiles(rel)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [rel] : []
    })
  }

  it('routes browser getUser calls through getBrowserUser instead of calling the auth client directly', () => {
    const offenders = clientDirs
      .flatMap(sourceFiles)
      .filter((file) => {
        const src = readFileSync(path.join(root, file), 'utf8')
        return src.includes("'use client'") && /supabase\s*\.auth\s*\.getUser\(/.test(src)
      })
    expect(offenders).toEqual([])
  })
})
