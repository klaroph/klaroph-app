import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmailPreferences, setProductUpdates } from './emailPreferences'

type ProfileRow = { id: string; marketing_emails_unsubscribed_at: string | null }

/** Fake profiles table that mimics RLS: the session user only ever sees/updates their own row. */
function fakeClient(sessionUserId: string, rows: ProfileRow[], opts: { missingColumn?: boolean } = {}) {
  const table = new Map(rows.map((r) => [r.id, { ...r }]))
  const client = {
    from: () => {
      let patch: Partial<ProfileRow> | null = null
      let idFilter: string | null = null
      const builder = {
        select: () => builder,
        update: (values: Partial<ProfileRow>) => {
          patch = values
          return builder
        },
        eq: (_col: string, value: string) => {
          idFilter = value
          return builder
        },
        single: async () => {
          if (opts.missingColumn) {
            return { data: null, error: { code: '42703', message: 'column profiles.marketing_emails_unsubscribed_at does not exist' } }
          }
          const row = idFilter === sessionUserId ? table.get(idFilter) : undefined
          if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
          if (patch) Object.assign(row, patch)
          return { data: { ...row }, error: null }
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, table }
}

const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-09-26T12:00:00.000Z')

describe('email preferences — mapping to marketing_emails_unsubscribed_at', () => {
  it('treats NULL as subscribed (on)', async () => {
    const { client } = fakeClient(ME, [{ id: ME, marketing_emails_unsubscribed_at: null }])
    expect(await getEmailPreferences(client, ME)).toEqual({ ok: true, preferences: { productUpdates: true } })
  })

  it('treats a timestamp as unsubscribed (off)', async () => {
    const { client } = fakeClient(ME, [{ id: ME, marketing_emails_unsubscribed_at: '2026-09-01T00:00:00Z' }])
    expect(await getEmailPreferences(client, ME)).toEqual({ ok: true, preferences: { productUpdates: false } })
  })

  it('turning off writes the unsubscribe timestamp', async () => {
    const { client, table } = fakeClient(ME, [{ id: ME, marketing_emails_unsubscribed_at: null }])
    const result = await setProductUpdates(client, ME, false, NOW)
    expect(result).toEqual({ ok: true, preferences: { productUpdates: false } })
    expect(table.get(ME)?.marketing_emails_unsubscribed_at).toBe('2026-09-26T12:00:00.000Z')
  })

  it('turning on clears the timestamp', async () => {
    const { client, table } = fakeClient(ME, [{ id: ME, marketing_emails_unsubscribed_at: '2026-09-01T00:00:00Z' }])
    expect(await setProductUpdates(client, ME, true, NOW)).toEqual({ ok: true, preferences: { productUpdates: true } })
    expect(table.get(ME)?.marketing_emails_unsubscribed_at).toBeNull()
  })

  it("cannot modify another user's preference", async () => {
    const { client, table } = fakeClient(ME, [
      { id: ME, marketing_emails_unsubscribed_at: null },
      { id: OTHER, marketing_emails_unsubscribed_at: null },
    ])
    const result = await setProductUpdates(client, OTHER, false, NOW)
    expect(result.ok).toBe(false)
    expect(table.get(OTHER)?.marketing_emails_unsubscribed_at).toBeNull()
  })

  it('reports unavailable (503) until the marketing migration is applied', async () => {
    const { client } = fakeClient(ME, [], { missingColumn: true })
    expect(await getEmailPreferences(client, ME)).toMatchObject({ ok: false, status: 503 })
  })
})

describe('service role never reaches the client', () => {
  const ROOT = path.resolve(__dirname, '..')

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
    })
  }

  it('no client component imports supabaseAdmin or reads SUPABASE_SERVICE_ROLE_KEY', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((d) => sourceFiles(path.join(ROOT, d)))
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return /^\s*['"]use client['"]/.test(src) && /supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY/.test(src)
      })
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('the preference route and helpers use the RLS-scoped session client only', () => {
    for (const rel of ['app/api/profile/email-preferences/route.ts', 'lib/emailPreferences.ts']) {
      expect(readFileSync(path.join(ROOT, rel), 'utf8')).not.toMatch(/supabaseAdmin|SERVICE_ROLE/)
    }
  })
})
