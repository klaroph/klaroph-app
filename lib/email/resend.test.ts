import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const constructedWith: string[] = []

vi.mock('resend', () => ({
  Resend: class {
    batch = { send: sendMock }
    constructor(key: string) {
      constructedWith.push(key)
    }
  },
}))

import { getResendConfig, sendCampaignBatch, RESEND_BATCH_LIMIT, type CampaignMessage } from './resend'

const config = { apiKey: 're_test_key', from: 'KlaroPH <hello@klaroph.com>' }
const message: CampaignMessage = {
  to: 'juan@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  text: 'Hi',
  headers: {},
  tags: [],
}

beforeEach(() => {
  sendMock.mockReset()
  constructedWith.length = 0
})

describe('getResendConfig', () => {
  it('rejects a missing or blank RESEND_API_KEY', () => {
    expect(getResendConfig({})).toEqual({ ok: false, error: 'RESEND_API_KEY is not configured.' })
    expect(getResendConfig({ RESEND_API_KEY: '   ' }).ok).toBe(false)
  })

  it('returns the trimmed key and the shared From address', () => {
    const result = getResendConfig({ RESEND_API_KEY: ' re_abc ' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.apiKey).toBe('re_abc')
      expect(result.config.from).toMatch(/<.+@.+>/)
    }
  })
})

describe('sendCampaignBatch', () => {
  it('refuses empty and oversized batches without calling Resend', async () => {
    expect((await sendCampaignBatch(config, [], 'k')).ok).toBe(false)
    const tooMany = Array.from({ length: RESEND_BATCH_LIMIT + 1 }, () => message)
    expect((await sendCampaignBatch(config, tooMany, 'k')).ok).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends with From and idempotency key and returns ids', async () => {
    sendMock.mockResolvedValue({ data: { data: [{ id: 'email_1' }] }, error: null })
    const result = await sendCampaignBatch(config, [message], 'campaign-abc')
    expect(result).toEqual({ ok: true, ids: ['email_1'] })
    expect(constructedWith).toEqual(['re_test_key'])
    expect(sendMock).toHaveBeenCalledWith([{ from: config.from, ...message }], { idempotencyKey: 'campaign-abc' })
  })

  it('fails safely on Resend errors and thrown exceptions', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'Domain not verified' } })
    expect(await sendCampaignBatch(config, [message], 'k')).toEqual({ ok: false, error: 'Domain not verified' })

    sendMock.mockRejectedValueOnce(new Error('network down'))
    expect(await sendCampaignBatch(config, [message], 'k')).toEqual({ ok: false, error: 'network down' })
  })
})
