import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { v2LaunchCampaign } from './campaigns/v2Launch'
import { sendCampaign } from './campaignSender'
import type { MarketingRecipient } from './marketingAudience'

type Row = { campaign_id: string; user_id: string; status: string }

/** In-memory marketing_email_sends supporting the calls sendCampaign makes. */
function fakeAdmin(existing: Row[] = []) {
  const rows = new Map(existing.map((r) => [r.user_id, { ...r }]))
  const admin = {
    from: () => ({
      upsert: (input: Row[], opts: { ignoreDuplicates?: boolean }) => {
        const inserted: Row[] = []
        for (const row of input) {
          if (rows.has(row.user_id) && opts.ignoreDuplicates) continue
          rows.set(row.user_id, { ...rows.get(row.user_id), ...row })
          inserted.push(row)
        }
        const result = { data: inserted.map((r) => ({ user_id: r.user_id })), error: null }
        return { select: async () => result, then: (resolve: (v: typeof result) => void) => resolve(result) }
      },
      delete: () => ({
        eq: () => ({
          eq: () => ({
            in: async (_col: string, ids: string[]) => {
              ids.forEach((id) => rows.delete(id))
              return { error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient, rows }
}

const recipients: MarketingRecipient[] = ['a', 'b', 'c'].map((id) => ({
  userId: id,
  email: `${id}@example.com`,
  firstName: null,
}))

const deps = {
  resend: { apiKey: 're_test', from: 'KlaroPH <hello@klaroph.com>' },
  links: { appUrl: 'https://klaroph.com', unsubscribeSecret: 's'.repeat(40) },
  pause: async () => {},
}

describe('sendCampaign', () => {
  it('skips users already claimed and marks delivered users as sent', async () => {
    const { admin, rows } = fakeAdmin([{ campaign_id: v2LaunchCampaign.id, user_id: 'a', status: 'sent' }])
    const sendBatch = vi.fn().mockResolvedValue({ ok: true, ids: ['e1', 'e2'] })

    const summary = await sendCampaign({ ...deps, admin, sendBatch }, v2LaunchCampaign, recipients)

    expect(summary).toEqual({ sent: 2, failed: 0, skipped: 1 })
    expect(sendBatch.mock.calls[0][1].map((m: { to: string }) => m.to)).toEqual(['b@example.com', 'c@example.com'])
    expect(rows.get('b')?.status).toBe('sent')
    expect(rows.get('c')?.status).toBe('sent')
  })

  it('releases claims when a batch fails so the campaign can be retried', async () => {
    const { admin, rows } = fakeAdmin()
    const sendBatch = vi.fn().mockResolvedValue({ ok: false, error: 'rate limited' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const summary = await sendCampaign({ ...deps, admin, sendBatch }, v2LaunchCampaign, recipients)

    expect(summary).toEqual({ sent: 0, failed: 3, skipped: 0 })
    expect(rows.size).toBe(0)
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('@example.com')
    errorSpy.mockRestore()
  })
})
