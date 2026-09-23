export type ClaimResult = 'claimed' | 'duplicate'

/**
 * Insert-first claim: process only if this delivery won the unique event_id.
 * On handler failure, release so PayMongo retries remain legitimate.
 */
export async function runClaimedWebhookHandler(params: {
  claim: () => Promise<ClaimResult>
  release: () => Promise<void>
  handle: () => Promise<void>
}): Promise<{ outcome: 'ok' | 'already_processed'; processCountDelta: number }> {
  const claimed = await params.claim()
  if (claimed === 'duplicate') {
    return { outcome: 'already_processed', processCountDelta: 0 }
  }

  try {
    await params.handle()
    return { outcome: 'ok', processCountDelta: 1 }
  } catch (err) {
    await params.release()
    throw err
  }
}
