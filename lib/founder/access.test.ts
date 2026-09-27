import { afterEach, describe, expect, it, vi } from 'vitest'

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}))

import { getFounderUser, requireFounder } from './access'

const founder = { id: 'f1', email: 'founder@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
const signedIn = (user: unknown) => getUser.mockResolvedValue({ data: { user } })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('founder access (guards every dock page, including Support)', () => {
  it('lets the verified founder through', async () => {
    vi.stubEnv('FOUNDER_EMAIL', 'Founder@Example.com')
    signedIn(founder)
    expect(await requireFounder()).toEqual({ id: 'f1', email: 'founder@example.com' })
    expect(await getFounderUser()).toEqual({ id: 'f1', email: 'founder@example.com' })
  })

  it('sends non-founders to their dashboard and signed-out visitors home', async () => {
    vi.stubEnv('FOUNDER_EMAIL', 'founder@example.com')
    signedIn({ ...founder, email: 'demo@example.com' })
    await expect(requireFounder()).rejects.toThrow('redirect:/dashboard')
    expect(await getFounderUser()).toBeNull()

    signedIn(null)
    await expect(requireFounder()).rejects.toThrow('redirect:/')
  })

  it('fails closed when FOUNDER_EMAIL is unset or the email is unconfirmed', async () => {
    vi.stubEnv('FOUNDER_EMAIL', '')
    signedIn(founder)
    expect(await getFounderUser()).toBeNull()

    vi.stubEnv('FOUNDER_EMAIL', 'founder@example.com')
    signedIn({ ...founder, email_confirmed_at: null })
    expect(await getFounderUser()).toBeNull()
  })
})
