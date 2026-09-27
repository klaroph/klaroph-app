import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  insertResult: { data: null, error: null } as { data: { id: string; created_at: string } | null; error: { message: string } | null },
  inserted: [] as unknown[],
  afterCallbacks: [] as (() => unknown)[],
  notify: vi.fn(async () => {}),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => state.afterCallbacks.push(fn),
}))
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: (values: unknown) => {
        state.inserted.push({ table, values })
        return { select: () => ({ single: async () => state.insertResult }) }
      },
    }),
  },
}))
vi.mock('@/lib/founder/alertsServer', () => ({ notifyFounderOfSupportRequest: state.notify }))

import { POST } from './route'

let userCounter = 0
const post = (body: unknown) => POST(new Request('http://localhost/api/support', { method: 'POST', body: JSON.stringify(body) }))

async function flushAfter() {
  for (const fn of state.afterCallbacks.splice(0)) await fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  // A fresh user per test keeps the in-memory rate limit out of the way.
  state.user = { id: `user-${++userCounter}`, email: 'maria@example.com' }
  state.insertResult = { data: { id: 'req-1', created_at: '2026-09-27T07:04:00.000Z' }, error: null }
  state.inserted = []
  state.afterCallbacks = []
})

describe('POST /api/support founder alert', () => {
  it('alerts the founder after a successful insert, using the saved request id', async () => {
    const res = await post({ subject: 'Payment issue', message: 'Paid but still Free' })
    expect(res.status).toBe(200)
    expect(state.notify).not.toHaveBeenCalled() // runs after the response
    await flushAfter()
    expect(state.notify).toHaveBeenCalledTimes(1)
    expect(state.notify).toHaveBeenCalledWith({
      requestId: 'req-1',
      userId: state.user!.id,
      email: 'maria@example.com',
      subject: 'Payment issue',
      message: 'Paid but still Free',
      createdAt: '2026-09-27T07:04:00.000Z',
    })
  })

  it('sends no alert when the insert fails', async () => {
    state.insertResult = { data: null, error: { message: 'insert failed' } }
    const res = await post({ message: 'Hello' })
    expect(res.status).toBe(500)
    expect(state.afterCallbacks).toHaveLength(0)
    expect(state.notify).not.toHaveBeenCalled()
  })

  it('sends no alert for rejected requests', async () => {
    expect((await post({ message: '   ' })).status).toBe(400)
    state.user = null
    expect((await post({ message: 'Hello' })).status).toBe(401)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('ignores any recipient or identity the browser tries to pass', async () => {
    await post({ message: 'Hello', to: 'attacker@example.com', recipient: 'attacker@example.com', email: 'x@example.com', userId: 'other' })
    await flushAfter()
    const [input] = state.notify.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(input).not.toHaveProperty('to')
    expect(input).not.toHaveProperty('recipient')
    expect(input.email).toBe('maria@example.com')
    expect(input.userId).toBe(state.user!.id)
  })

  it('one request produces one alert', async () => {
    await post({ message: 'Hello' })
    await flushAfter()
    await flushAfter()
    expect(state.notify).toHaveBeenCalledTimes(1)
  })
})
