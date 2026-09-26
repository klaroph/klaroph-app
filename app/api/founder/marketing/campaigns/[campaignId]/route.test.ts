import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadMarketingAudience, sendCampaign, sendCampaignBatch } = vi.hoisted(() => ({
  loadMarketingAudience: vi.fn(),
  sendCampaign: vi.fn(),
  sendCampaignBatch: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/email/marketingAudience', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/marketingAudience')>()),
  loadMarketingAudience,
}))
vi.mock('@/lib/email/campaignSender', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/campaignSender')>()),
  sendCampaign,
}))
vi.mock('@/lib/email/resend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/resend')>()),
  sendCampaignBatch,
}))

import { GET, POST } from './route'

const CAMPAIGN_ID = 'v2-launch-2026'
const SECRET = 'founder-secret'
const params = (campaignId = CAMPAIGN_ID) => ({ params: Promise.resolve({ campaignId }) })
const recipients = [{ userId: 'u1', email: 'u1@example.com', firstName: null }]

function request(method: 'GET' | 'POST', body?: unknown, token: string | null = SECRET, query = '') {
  return new Request(`http://localhost/api/founder/marketing/campaigns/${CAMPAIGN_ID}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const sendBody = { action: 'send', confirmCampaignId: CAMPAIGN_ID, expectedRecipientCount: 1 }

beforeEach(() => {
  vi.stubEnv('FOUNDER_DASHBOARD_SECRET', SECRET)
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('MARKETING_UNSUBSCRIBE_SECRET', 'u'.repeat(40))
  vi.stubEnv('MARKETING_TEST_EMAIL', 'founder@example.com')
  vi.stubEnv('MARKETING_CAMPAIGN_SENDS_ENABLED', 'true')
  loadMarketingAudience.mockResolvedValue({ ok: true, recipients, alreadySentCount: 0 })
  sendCampaign.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 })
  sendCampaignBatch.mockResolvedValue({ ok: true, ids: ['e1'] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('founder campaign route — authorization', () => {
  it('rejects missing or wrong bearer tokens and an unset secret', async () => {
    expect((await GET(request('GET', undefined, null), params())).status).toBe(401)
    expect((await POST(request('POST', sendBody, 'wrong'), params())).status).toBe(401)
    vi.stubEnv('FOUNDER_DASHBOARD_SECRET', '')
    expect((await POST(request('POST', sendBody), params())).status).toBe(401)
    expect(sendCampaign).not.toHaveBeenCalled()
  })

  it('returns counts only — never recipient emails', async () => {
    const res = await GET(request('GET'), params())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.eligibleCount).toBe(1)
    expect(JSON.stringify(body)).not.toContain('@example.com')
  })

  it('404s unknown campaigns', async () => {
    expect((await GET(request('GET'), params('nope'))).status).toBe(404)
  })
})

describe('founder campaign route — send safeguards', () => {
  it('sends test email only to MARKETING_TEST_EMAIL', async () => {
    const res = await POST(request('POST', { action: 'test', to: 'attacker@example.com' }), params())
    expect(res.status).toBe(200)
    const [, messages] = sendCampaignBatch.mock.calls[0]
    expect(messages.map((m: { to: string }) => m.to)).toEqual(['founder@example.com'])
    expect(messages[0].subject.startsWith('[TEST] ')).toBe(true)
  })

  it('blocks sends when the kill switch is off', async () => {
    vi.stubEnv('MARKETING_CAMPAIGN_SENDS_ENABLED', 'false')
    expect((await POST(request('POST', sendBody), params())).status).toBe(403)
    expect(sendCampaign).not.toHaveBeenCalled()
  })

  it('requires the explicit campaign confirmation and expected count', async () => {
    expect((await POST(request('POST', { ...sendBody, confirmCampaignId: 'other' }), params())).status).toBe(400)
    expect((await POST(request('POST', { ...sendBody, expectedRecipientCount: undefined }), params())).status).toBe(400)
    expect(sendCampaign).not.toHaveBeenCalled()
  })

  it('refuses when the audience changed or is empty', async () => {
    expect((await POST(request('POST', { ...sendBody, expectedRecipientCount: 5 }), params())).status).toBe(409)
    loadMarketingAudience.mockResolvedValue({ ok: true, recipients: [], alreadySentCount: 1 })
    expect((await POST(request('POST', sendBody), params())).status).toBe(400)
    expect(sendCampaign).not.toHaveBeenCalled()
  })

  it('refuses when delivery config is incomplete', async () => {
    vi.stubEnv('MARKETING_UNSUBSCRIBE_SECRET', '')
    expect((await POST(request('POST', sendBody), params())).status).toBe(500)
    expect(sendCampaign).not.toHaveBeenCalled()
  })

  it('sends to the server-computed audience, ignoring any client recipient list', async () => {
    const res = await POST(request('POST', { ...sendBody, recipients: ['attacker@example.com'] }), params())
    expect(res.status).toBe(200)
    expect(sendCampaign.mock.calls[0][2]).toBe(recipients)
  })
})
