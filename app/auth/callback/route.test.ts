import { afterEach, describe, expect, it, vi } from 'vitest'

const { exchange, sendWelcomeEmail } = vi.hoisted(() => ({
  exchange: vi.fn(),
  sendWelcomeEmail: vi.fn(async () => false),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: exchange } }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
vi.mock('@/lib/welcomeEmail', () => ({ sendWelcomeEmail }))
vi.mock('@/lib/supabaseAdmin', () => {
  const profile = {
    terms_accepted_at: '2026-01-01T00:00:00Z',
    privacy_accepted_at: '2026-01-01T00:00:00Z',
    terms_version: 'v',
    privacy_version: 'v',
    full_name: 'Someone',
    welcome_email_sent_at: '2026-01-01T00:00:00Z',
  }
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    single: async () => ({ data: profile, error: null }),
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  }
  return { supabaseAdmin: { from: () => chain } }
})

import { GET } from './route'

const FOUNDER_EMAIL = 'founder@klaroph.test'
const confirmed = '2026-01-01T00:00:00Z'

function callback(query = '?code=oauth-code') {
  return GET(new Request(`http://localhost:3000/auth/callback${query}`, { headers: { host: 'localhost:3000' } }))
}

function signedIn(user: { id: string; email: string; email_confirmed_at: string | null }) {
  exchange.mockResolvedValue({ data: { session: { user: { ...user, user_metadata: {} } } }, error: null })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('auth callback — Google OAuth landing', () => {
  it('lands the verified founder in Mission Control', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    signedIn({ id: 'founder-1', email: FOUNDER_EMAIL, email_confirmed_at: confirmed })
    const res = await callback()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/founder')
  })

  it('lands a normal user on the dashboard', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    signedIn({ id: 'user-1', email: 'user@klaroph.test', email_confirmed_at: confirmed })
    expect((await callback()).headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('cannot be steered to Mission Control by query parameters', async () => {
    vi.stubEnv('FOUNDER_EMAIL', FOUNDER_EMAIL)
    signedIn({ id: 'user-1', email: 'user@klaroph.test', email_confirmed_at: confirmed })
    expect((await callback('?code=oauth-code&next=/admin/founder&email=founder@klaroph.test')).headers.get('location')).toBe(
      'http://localhost:3000/dashboard'
    )
  })

  it('sends failed or missing codes back to login', async () => {
    exchange.mockResolvedValue({ data: { session: null }, error: new Error('bad code') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(new URL((await callback()).headers.get('location')!).pathname).toBe('/login')
    expect(new URL((await callback('')).headers.get('location')!).pathname).toBe('/login')
  })
})
