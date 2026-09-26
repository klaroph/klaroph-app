import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  updates: [] as { values: unknown; id: string }[],
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      let values: unknown = undefined
      const builder = {
        select: () => builder,
        update: (v: unknown) => {
          values = v
          return builder
        },
        eq: (_col: string, id: string) => {
          if (values !== undefined) state.updates.push({ values, id })
          return builder
        },
        single: async () => ({
          data: { marketing_emails_unsubscribed_at: (values as { marketing_emails_unsubscribed_at?: string | null })?.marketing_emails_unsubscribed_at ?? null },
          error: null,
        }),
      }
      return builder
    },
  }),
}))

import { GET, PATCH } from './route'

const ME = '11111111-1111-1111-1111-111111111111'
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/profile/email-preferences', { method: 'PATCH', body: JSON.stringify(body) }))

beforeEach(() => {
  state.user = { id: ME }
  state.updates = []
})

describe('/api/profile/email-preferences', () => {
  it('requires a signed-in user', async () => {
    state.user = null
    expect((await GET()).status).toBe(401)
    expect((await patch({ productUpdates: false })).status).toBe(401)
    expect(state.updates).toEqual([])
  })

  it("only updates the session user's profile, ignoring any id in the body", async () => {
    const res = await patch({ productUpdates: false, userId: 'someone-else', id: 'someone-else' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ productUpdates: false })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].id).toBe(ME)
    expect(state.updates[0].values).toEqual({ marketing_emails_unsubscribed_at: expect.any(String) })
  })

  it('turning on clears the timestamp', async () => {
    const res = await patch({ productUpdates: true })
    expect(await res.json()).toEqual({ productUpdates: true })
    expect(state.updates[0].values).toEqual({ marketing_emails_unsubscribed_at: null })
  })

  it('rejects non-boolean input', async () => {
    expect((await patch({ productUpdates: 'yes' })).status).toBe(400)
    expect(state.updates).toEqual([])
  })
})
