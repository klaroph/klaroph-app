import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runDailyFounderReport } = vi.hoisted(() => ({ runDailyFounderReport: vi.fn() }))
vi.mock('@/lib/founder/alertsServer', () => ({ runDailyFounderReport }))

import { GET } from './route'

const get = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/founder-report', { headers: authorization ? { authorization } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret-value')
  runDailyFounderReport.mockResolvedValue({ status: 'sent', id: 're_1', reportDate: '2026-09-26' })
})

describe('GET /api/cron/founder-report', () => {
  it('rejects requests without the cron secret and generates nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 'cron-secret-value', 'Basic cron-secret-value']) {
      expect((await get(header)).status).toBe(401)
    }
    expect(runDailyFounderReport).not.toHaveBeenCalled()
  })

  it('stays locked when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await get('Bearer ')).status).toBe(401)
    expect((await get('Bearer undefined')).status).toBe(401)
    expect(runDailyFounderReport).not.toHaveBeenCalled()
  })

  it('runs the report for Vercel Cron and returns only the outcome, never report content', async () => {
    const res = await get('Bearer cron-secret-value')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'sent', reportDate: '2026-09-26' })
    expect(runDailyFounderReport).toHaveBeenCalledTimes(1)
  })

  it('reports a delivery failure with a 500 so it shows in cron logs', async () => {
    runDailyFounderReport.mockResolvedValue({ status: 'failed', error: 'rate limited', reportDate: '2026-09-26' })
    const res = await get('Bearer cron-secret-value')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'failed', reportDate: '2026-09-26' })
  })
})
