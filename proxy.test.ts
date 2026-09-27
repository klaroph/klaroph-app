import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { CookieMethodsServer, CookieOptions } from '@supabase/ssr'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'

type SessionUser = { id: string; email?: string; email_confirmed_at?: string | null }
type GetUserResult = { data: { user: SessionUser | null }; error: Error | null }
type GetUserImpl = (cookies: CookieMethodsServer) => Promise<GetUserResult>

const state: { getUser: GetUserImpl } = {
  getUser: async () => ({ data: { user: null }, error: new AuthSessionMissingError() }),
}

vi.mock('@supabase/ssr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/ssr')>()
  return {
    ...actual,
    createServerClient: (_url: string, _key: string, opts: { cookies: CookieMethodsServer }) => ({
      auth: { getUser: () => state.getUser(opts.cookies) },
    }),
  }
})

const { DEFAULT_COOKIE_OPTIONS } = await vi.importActual<typeof import('@supabase/ssr')>('@supabase/ssr')
const { proxy, config } = await import('./proxy')

const AUTH_COOKIE = 'sb-test-auth-token'
const USER = { id: 'user-1' }
const SUPABASE_OPTIONS: CookieOptions = { ...DEFAULT_COOKIE_OPTIONS }

function requestFor(path: string, cookie = `${AUTH_COOKIE}=old-session`) {
  return new NextRequest(`https://klaroph.test${path}`, { headers: { cookie } })
}

function validSession(user: SessionUser = USER): GetUserImpl {
  return async () => ({ data: { user }, error: null })
}

function refreshedSession(): GetUserImpl {
  return async (cookies) => {
    await cookies.setAll?.([{ name: AUTH_COOKIE, value: 'rotated-session', options: SUPABASE_OPTIONS }])
    return { data: { user: USER }, error: null }
  }
}

function revokedRefreshToken(): GetUserImpl {
  return async (cookies) => {
    await cookies.setAll?.([{ name: AUTH_COOKIE, value: '', options: { ...SUPABASE_OPTIONS, maxAge: 0 } }])
    return {
      data: { user: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    }
  }
}

function authServerUnreachable(): GetUserImpl {
  return async () => ({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
}

function authCookieHeader(response: Response): string | undefined {
  return response.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`))
}

beforeEach(() => {
  state.getUser = async () => ({ data: { user: null }, error: new AuthSessionMissingError() })
})

describe('proxy — PWA launch at start_url "/"', () => {
  it('sends a valid session straight to the dashboard', async () => {
    state.getUser = validSession()
    const res = await proxy(requestFor('/'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('keeps refreshed cookies persistent across the redirect (expired access token, valid refresh token)', async () => {
    state.getUser = refreshedSession()
    const res = await proxy(requestFor('/'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
    const cookie = authCookieHeader(res)
    expect(cookie).toContain('rotated-session')
    expect(cookie).toContain(`Max-Age=${DEFAULT_COOKIE_OPTIONS.maxAge}`)
    expect(cookie?.toLowerCase()).toContain('samesite=lax')
    expect(cookie).toContain('Path=/')
  })
})

describe('proxy — dashboard guard', () => {
  it('passes a valid session through', async () => {
    state.getUser = validSession()
    const res = await proxy(requestFor('/dashboard'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('persists refreshed cookies and exposes them to Server Components in the same request', async () => {
    state.getUser = refreshedSession()
    const req = requestFor('/dashboard/expenses')
    const res = await proxy(req)
    expect(res.headers.get('location')).toBeNull()
    expect(authCookieHeader(res)).toContain(`Max-Age=${DEFAULT_COOKIE_OPTIONS.maxAge}`)
    expect(req.cookies.get(AUTH_COOKIE)?.value).toBe('rotated-session')
  })

  it('sends a user without cookies to the landing page', async () => {
    const res = await proxy(requestFor('/dashboard', ''))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
  })

  it('requires login when the refresh token is invalid, forwarding Supabase cookie removal', async () => {
    state.getUser = revokedRefreshToken()
    const res = await proxy(requestFor('/dashboard'))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    expect(authCookieHeader(res)).toContain('Max-Age=0')
  })
})

describe('proxy — temporary Auth/network failure', () => {
  it('does not redirect a dashboard request to login', async () => {
    state.getUser = authServerUnreachable()
    const res = await proxy(requestFor('/dashboard'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('does not clear or rewrite auth cookies', async () => {
    state.getUser = authServerUnreachable()
    const res = await proxy(requestFor('/dashboard'))
    expect(authCookieHeader(res)).toBeUndefined()
  })

  it('does not redirect the landing page either, so there is no bounce', async () => {
    state.getUser = authServerUnreachable()
    const res = await proxy(requestFor('/'))
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('proxy — no redirect loops', () => {
  it('leaves the landing page alone for signed-out users', async () => {
    const res = await proxy(requestFor('/', ''))
    expect(res.headers.get('location')).toBeNull()
  })

  it('sends signed-in users away from /login but never away from /dashboard', async () => {
    state.getUser = validSession()
    const login = await proxy(requestFor('/login'))
    const dashboard = await proxy(requestFor('/dashboard'))
    expect(new URL(login.headers.get('location')!).pathname).toBe('/dashboard')
    expect(dashboard.headers.get('location')).toBeNull()
  })
})

describe('proxy — founder landing', () => {
  const FOUNDER_EMAIL = 'founder@klaroph.test'
  const founder: SessionUser = { id: 'founder-1', email: FOUNDER_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' }

  afterEach(() => vi.unstubAllEnvs())

  it.each(['/', '/login'])('sends the verified founder from %s to Mission Control', async (path) => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    state.getUser = validSession(founder)
    const res = await proxy(requestFor(path))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/founder')
  })

  it('sends everyone else to the dashboard, including an unconfirmed founder email', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    state.getUser = validSession({ id: 'user-2', email: 'user@klaroph.test', email_confirmed_at: '2026-01-01T00:00:00Z' })
    expect(new URL((await proxy(requestFor('/'))).headers.get('location')!).pathname).toBe('/dashboard')
    state.getUser = validSession({ ...founder, email_confirmed_at: null })
    expect(new URL((await proxy(requestFor('/'))).headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('never redirects the founder away from /dashboard or /admin/founder (no loops)', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    state.getUser = validSession(founder)
    expect((await proxy(requestFor('/dashboard'))).headers.get('location')).toBeNull()
    expect((await proxy(requestFor('/admin/founder'))).headers.get('location')).toBeNull()
  })

  it('ignores query parameters when deciding who is the founder', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    state.getUser = validSession()
    const res = await proxy(requestFor(`/?founder=1&email=${FOUNDER_EMAIL}&next=/admin/founder`))
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
  })
})

describe('proxy — onboarding, legal update, admin coverage', () => {
  it('includes the Server Component auth routes in the matcher', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/onboarding', '/legal-update', '/admin/:path*'])
    )
  })

  it.each(['/onboarding', '/legal-update', '/admin/founder'])(
    'refreshes and persists cookies on %s without redirecting (page keeps its own guard)',
    async (path) => {
      state.getUser = refreshedSession()
      const req = requestFor(path)
      const res = await proxy(req)
      expect(res.headers.get('location')).toBeNull()
      expect(authCookieHeader(res)).toContain(`Max-Age=${DEFAULT_COOKIE_OPTIONS.maxAge}`)
      expect(req.cookies.get(AUTH_COOKIE)?.value).toBe('rotated-session')
    }
  )

  it.each(['/onboarding', '/legal-update', '/admin/founder'])(
    'does not redirect signed-out users on %s (the page redirects them itself)',
    async (path) => {
      const res = await proxy(requestFor(path, ''))
      expect(res.headers.get('location')).toBeNull()
    }
  )
})
