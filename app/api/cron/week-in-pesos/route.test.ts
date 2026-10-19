import { readFileSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runWeeklySummary, sendWeeklySummaryTest } = vi.hoisted(() => ({
  runWeeklySummary: vi.fn(),
  sendWeeklySummaryTest: vi.fn(),
}))

vi.mock('@/lib/email/weeklySummary', () => ({ runWeeklySummary, sendWeeklySummaryTest }))

import { GET, maxDuration } from './route'

const get = (authorization?: string, query = '') =>
  GET(new Request(`http://localhost/api/cron/week-in-pesos${query}`, { headers: authorization ? { authorization } : {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret-value')
  runWeeklySummary.mockResolvedValue({
    status: 200,
    body: { ok: true, sendsEnabled: false, campaignId: 'week-2026-10-12', eligible: 1, skippedNoActivity: 0, wouldSend: 1 },
  })
  sendWeeklySummaryTest.mockResolvedValue({ status: 200, body: { ok: true, mode: 'test' } })
})

describe('GET /api/cron/week-in-pesos', () => {
  it('rejects a missing or wrong bearer, the raw secret, and Basic auth', async () => {
    for (const header of [undefined, 'Bearer wrong', 'cron-secret-value', 'Basic cron-secret-value']) {
      expect((await get(header)).status).toBe(401)
    }
    expect(runWeeklySummary).not.toHaveBeenCalled()
    expect(sendWeeklySummaryTest).not.toHaveBeenCalled()
  })

  it('stays locked when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await get('Bearer ')).status).toBe(401)
    expect((await get('Bearer undefined')).status).toBe(401)
    expect(runWeeklySummary).not.toHaveBeenCalled()
    expect(sendWeeklySummaryTest).not.toHaveBeenCalled()
  })

  it('runs the summary for Vercel Cron', async () => {
    const res = await get('Bearer cron-secret-value')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      sendsEnabled: false,
      campaignId: 'week-2026-10-12',
      eligible: 1,
      skippedNoActivity: 0,
      wouldSend: 1,
    })
    expect(runWeeklySummary).toHaveBeenCalledTimes(1)
    expect(sendWeeklySummaryTest).not.toHaveBeenCalled()
  })

  it('sends a test message only when test=1, and ignores any caller address', async () => {
    const res = await get('Bearer cron-secret-value', '?test=1&to=attacker@example.com')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'test' })
    expect(sendWeeklySummaryTest).toHaveBeenCalledTimes(1)
    expect(sendWeeklySummaryTest.mock.calls[0]).toHaveLength(1)
    expect(sendWeeklySummaryTest.mock.calls[0][0]).toBeInstanceOf(Date)
    expect(runWeeklySummary).not.toHaveBeenCalled()
  })

  it('does not treat other test query values as the test send', async () => {
    await get('Bearer cron-secret-value', '?test=true')
    expect(runWeeklySummary).toHaveBeenCalledTimes(1)
    expect(sendWeeklySummaryTest).not.toHaveBeenCalled()
  })

  it('schedules Monday 08:00 Manila (00:00 UTC) and allows 60 seconds', () => {
    const config = JSON.parse(readFileSync(path.join(__dirname, '../../../..', 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    expect(config.crons).toContainEqual({ path: '/api/cron/week-in-pesos', schedule: '0 0 * * 1' })
    expect(maxDuration).toBe(60)
  })
})
