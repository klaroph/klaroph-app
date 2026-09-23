import { describe, expect, it } from 'vitest'
import { runClaimedWebhookHandler } from './paymentEventIdempotency'

describe('runClaimedWebhookHandler', () => {
  it('processes a first delivery and skips a duplicate so payment is not applied twice', async () => {
    const claimed = new Set<string>()
    let processCount = 0
    const eventId = 'evt_dup'

    const deps = {
      claim: async () => {
        if (claimed.has(eventId)) return 'duplicate' as const
        claimed.add(eventId)
        return 'claimed' as const
      },
      release: async () => {
        claimed.delete(eventId)
      },
      handle: async () => {
        processCount += 1
      },
    }

    const first = await runClaimedWebhookHandler(deps)
    const second = await runClaimedWebhookHandler(deps)

    expect(first.outcome).toBe('ok')
    expect(second.outcome).toBe('already_processed')
    expect(processCount).toBe(1)
    expect(claimed.has(eventId)).toBe(true)
  })

  it('releases the claim when the handler fails so a retry can process', async () => {
    const claimed = new Set<string>()
    let attempts = 0
    const eventId = 'evt_retry'

    const run = () =>
      runClaimedWebhookHandler({
        claim: async () => {
          if (claimed.has(eventId)) return 'duplicate'
          claimed.add(eventId)
          return 'claimed'
        },
        release: async () => {
          claimed.delete(eventId)
        },
        handle: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('transient')
        },
      })

    await expect(run()).rejects.toThrow('transient')
    expect(claimed.has(eventId)).toBe(false)

    const retry = await run()
    expect(retry.outcome).toBe('ok')
    expect(attempts).toBe(2)
  })
})
