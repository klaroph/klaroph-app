import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runPaydaySummary, sendPaydaySummaryTest } = vi.hoisted(() => ({
  runPaydaySummary: vi.fn(),
  sendPaydaySummaryTest: vi.fn(),
}))

vi.mock('@/lib/email/paydaySummary', () => ({ runPaydaySummary, sendPaydaySummaryTest }))

import { GET, maxDuration } from './route'

const get = (authorization?: string, query = '', extraHeaders: Record<string, string> = {}) =>
  GET(
    new Request(`http://localhost/api/cron/payday-summary${query}`, {
      headers: { ...(authorization ? { authorization } : {}), ...extraHeaders },
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret-value')
  runPaydaySummary.mockResolvedValue({
    status: 200,
    body: { ok: true, sendsEnabled: false, campaignId: 'half-2026-10-a', eligible: 1, skippedNoActivity: 0, wouldSend: 1 },
  })
  sendPaydaySummaryTest.mockResolvedValue({ status: 200, body: { ok: true, mode: 'test' } })
})

describe('GET /api/cron/payday-summary', () => {
  it('rejects a missing or wrong bearer, the raw secret, and Basic auth', async () => {
    for (const header of [undefined, 'Bearer wrong', 'cron-secret-value', 'Basic cron-secret-value']) {
      expect((await get(header)).status).toBe(401)
    }
    expect(runPaydaySummary).not.toHaveBeenCalled()
    expect(sendPaydaySummaryTest).not.toHaveBeenCalled()
  })

  it('stays locked when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await get('Bearer ')).status).toBe(401)
    expect((await get('Bearer undefined')).status).toBe(401)
    expect(runPaydaySummary).not.toHaveBeenCalled()
    expect(sendPaydaySummaryTest).not.toHaveBeenCalled()
  })

  it('runs the summary from the fire time and ignores cron or date headers', async () => {
    const before = Date.now()
    const res = await get('Bearer cron-secret-value', '?date=2020-01-01', {
      'x-vercel-cron': '1',
      'x-vercel-cron-schedule': '0 0 15,28-31 * *',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      sendsEnabled: false,
      campaignId: 'half-2026-10-a',
      eligible: 1,
      skippedNoActivity: 0,
      wouldSend: 1,
    })
    expect(runPaydaySummary).toHaveBeenCalledTimes(1)
    expect(runPaydaySummary.mock.calls[0]).toHaveLength(1)
    const firedAt = runPaydaySummary.mock.calls[0][0] as Date
    expect(firedAt).toBeInstanceOf(Date)
    expect(firedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(firedAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(sendPaydaySummaryTest).not.toHaveBeenCalled()
  })

  it('sends a test message only when test=1, and ignores any caller address', async () => {
    const res = await get('Bearer cron-secret-value', '?test=1&to=attacker@example.com')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'test' })
    expect(sendPaydaySummaryTest).toHaveBeenCalledTimes(1)
    expect(sendPaydaySummaryTest.mock.calls[0]).toHaveLength(1)
    expect(sendPaydaySummaryTest.mock.calls[0][0]).toBeInstanceOf(Date)
    expect(runPaydaySummary).not.toHaveBeenCalled()
  })

  it('does not treat other test query values as the test send', async () => {
    await get('Bearer cron-secret-value', '?test=true')
    expect(runPaydaySummary).toHaveBeenCalledTimes(1)
    expect(sendPaydaySummaryTest).not.toHaveBeenCalled()
  })

  it('schedules 08:00 Manila on the 15th and the 28th through 31st, and removes the weekly cron', () => {
    const config = JSON.parse(readFileSync(path.join(__dirname, '../../../..', 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    expect(config.crons).toEqual([
      { path: '/api/cron/founder-report', schedule: '0 2 * * *' },
      { path: '/api/cron/payday-summary', schedule: '0 0 15,28-31 * *' },
    ])
    expect(config.crons.some((cron) => cron.path.includes('week-in-pesos'))).toBe(false)
    expect(existsSync(path.join(__dirname, '../week-in-pesos'))).toBe(false)
    expect(existsSync(path.join(__dirname, '../../../../lib/email/weeklySummary.ts'))).toBe(false)
    expect(existsSync(path.join(__dirname, '../../../../lib/email/manilaWeek.ts'))).toBe(false)
    expect(maxDuration).toBe(60)
  })
})
