import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { buildProEmailSample, sendProEmailSample } from './proEmailSamples'

const NOW = new Date('2026-09-26T04:00:00.000Z')

function deps(...args: [recipient?: string]) {
  const recipient = args.length ? args[0] : 'test-inbox@example.com'
  const send = vi.fn(async () => ({ ok: true as const, id: 're_sample' }))
  return { send, deps: { recipient, send, now: NOW } }
}

describe('buildProEmailSample', () => {
  it('renders both samples in test mode from fixture data', () => {
    const paid = buildProEmailSample('paid', NOW)
    expect(paid.subject).toBe('[TEST] You’re officially KlaroPH Pro')
    expect(paid.text).toContain('No payment was made and no subscription was changed.')
    expect(paid.text).toContain('Amount paid: ₱199.00')
    expect(paid.text).toContain('Active until: October 26, 2026')

    const comp = buildProEmailSample('complimentary', NOW)
    expect(comp.subject).toBe('[TEST] You’ve got KlaroPH Pro — on us')
    expect(comp.text).toContain('No Pro access was granted and no account was changed.')
    expect(comp.text).toContain('Active until: December 26, 2026')
  })
})

describe('sendProEmailSample', () => {
  it('sends only to the configured test inbox through the injected Resend helper', async () => {
    const { send, deps: d } = deps(' Test-Inbox@Example.com ')
    expect(await sendProEmailSample(d, 'paid')).toEqual({ ok: true, id: 're_sample' })
    expect(send).toHaveBeenCalledTimes(1)
    const [message, key] = send.mock.calls[0] as unknown as [{ to: string; subject: string }, string]
    expect(message.to).toBe('test-inbox@example.com')
    expect(message.subject).toContain('[TEST]')
    expect(key).toMatch(/^pro-email-sample-paid-[0-9a-f]{24}$/)
  })

  it('refuses when no valid test inbox is configured', async () => {
    for (const recipient of [undefined, '', 'not-an-email']) {
      const { send, deps: d } = deps(recipient)
      expect(await sendProEmailSample(d, 'paid')).toEqual({ ok: false, error: 'MARKETING_TEST_EMAIL is not configured.' })
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('rejects unknown sample kinds', async () => {
    const { send, deps: d } = deps()
    expect(await sendProEmailSample(d, 'lifetime-grant')).toEqual({ ok: false, error: 'Unknown sample.' })
    expect(await sendProEmailSample(d, { kind: 'paid', to: 'someone@example.com' })).toMatchObject({ ok: false })
    expect(send).not.toHaveBeenCalled()
  })

  it('reuses one idempotency key for a repeated identical sample, and a distinct key per kind', async () => {
    const { send, deps: d } = deps()
    await sendProEmailSample(d, 'paid')
    await sendProEmailSample(d, 'paid')
    await sendProEmailSample(d, 'complimentary')
    const keys = send.mock.calls.map((call) => (call as unknown as [unknown, string])[1])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('reports Resend failures', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'rate limited' }))
    expect(await sendProEmailSample({ recipient: 'test-inbox@example.com', send, now: NOW }, 'complimentary')).toEqual({
      ok: false,
      error: 'rate limited',
    })
  })

  it('has no database access at all', () => {
    const source = readFileSync(path.join(__dirname, 'proEmailSamples.ts'), 'utf8')
    expect(source).not.toMatch(/supabase|\.from\(|premium_confirmation_emails|marketing_email_sends|subscriptions|profiles/i)
  })
})
