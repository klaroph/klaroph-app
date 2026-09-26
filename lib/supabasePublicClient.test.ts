import { describe, expect, it, vi } from 'vitest'

const createClient = vi.fn<(...args: unknown[]) => object>(() => ({}))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

describe('signup Supabase client', () => {
  it('uses its own storage key so it never contends for the main auth-token Navigator lock', async () => {
    await import('./supabasePublicClient')

    const options = createClient.mock.calls[0]?.[2] as { auth: Record<string, unknown> }
    expect(options.auth.storageKey).toBe('sb-klaroph-signup')
    expect(String(options.auth.storageKey)).not.toMatch(/-auth-token$/)
  })

  it('never persists, refreshes, or reads a session from the URL', async () => {
    await import('./supabasePublicClient')

    const options = createClient.mock.calls[0]?.[2] as { auth: Record<string, unknown> }
    expect(options.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    })
  })
})
