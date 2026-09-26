/**
 * Server-only marketing audience. KlaroPH (auth.users + profiles) is the source of truth;
 * recipients are always computed here, never accepted from a request.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getFirstName } from '@/lib/email/campaignTemplate'

export type AudienceSegment = 'all' | 'active' | 'dormant'
export const AUDIENCE_SEGMENTS: readonly AudienceSegment[] = ['all', 'active', 'dormant']

/** Signed in within this window = active; otherwise dormant. */
export const ACTIVE_WINDOW_DAYS = 30

const PAGE_SIZE = 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type AudienceAuthUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  last_sign_in_at?: string | null
  banned_until?: string | null
  deleted_at?: string | null
}

export type AudienceProfile = {
  id: string
  full_name: string | null
  nickname: string | null
  user_type: string
  marketing_emails_unsubscribed_at: string | null
}

export type MarketingRecipient = { userId: string; email: string; firstName: string | null }

export type AudienceResult =
  | { ok: true; recipients: MarketingRecipient[]; alreadySentCount: number }
  | { ok: false; error: string }

export function isAudienceSegment(value: unknown): value is AudienceSegment {
  return typeof value === 'string' && (AUDIENCE_SEGMENTS as readonly string[]).includes(value)
}

export function isValidMarketingEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email)
}

function matchesSegment(user: AudienceAuthUser, segment: AudienceSegment, now: Date): boolean {
  if (segment === 'all') return true
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN
  const cutoff = now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const isActive = Number.isFinite(lastSignIn) && lastSignIn >= cutoff
  return segment === 'active' ? isActive : !isActive
}

/**
 * Eligible = real user profile (not tester), confirmed + valid email, not banned/deleted,
 * not unsubscribed, not already claimed for this campaign, in the requested segment.
 */
export function selectEligibleRecipients(input: {
  authUsers: AudienceAuthUser[]
  profiles: AudienceProfile[]
  segment: AudienceSegment
  now: Date
  excludeUserIds?: ReadonlySet<string>
}): MarketingRecipient[] {
  const profilesById = new Map(input.profiles.map((p) => [p.id, p]))
  const seenEmails = new Set<string>()
  const recipients: MarketingRecipient[] = []

  for (const user of input.authUsers) {
    const profile = profilesById.get(user.id)
    if (!profile || profile.user_type !== 'user') continue
    if (profile.marketing_emails_unsubscribed_at) continue
    if (input.excludeUserIds?.has(user.id)) continue
    if (!user.email_confirmed_at || user.deleted_at) continue
    if (user.banned_until && Date.parse(user.banned_until) > input.now.getTime()) continue

    const email = user.email?.trim().toLowerCase()
    if (!isValidMarketingEmail(email) || seenEmails.has(email)) continue
    if (!matchesSegment(user, input.segment, input.now)) continue

    seenEmails.add(email)
    recipients.push({ userId: user.id, email, firstName: getFirstName(profile.nickname, profile.full_name) })
  }

  return recipients
}

export async function loadAuthUsers(admin: SupabaseClient): Promise<AudienceAuthUser[]> {
  const users: AudienceAuthUser[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error(`auth users: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < PAGE_SIZE) return users
  }
}

async function loadProfiles(admin: SupabaseClient): Promise<AudienceProfile[]> {
  const profiles: AudienceProfile[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, nickname, user_type, marketing_emails_unsubscribed_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`profiles: ${error.message}`)
    profiles.push(...((data ?? []) as AudienceProfile[]))
    if (!data || data.length < PAGE_SIZE) return profiles
  }
}

async function loadClaimedUserIds(admin: SupabaseClient, campaignId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('marketing_email_sends')
      .select('user_id')
      .eq('campaign_id', campaignId)
      .order('user_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`campaign sends: ${error.message}`)
    for (const row of data ?? []) ids.add(row.user_id as string)
    if (!data || data.length < PAGE_SIZE) return ids
  }
}

/** Recipients still owed this campaign. Users already claimed/sent are excluded and counted. */
export async function loadMarketingAudience(
  admin: SupabaseClient,
  campaignId: string,
  segment: AudienceSegment,
  now: Date = new Date()
): Promise<AudienceResult> {
  try {
    const [authUsers, profiles, claimed] = await Promise.all([
      loadAuthUsers(admin),
      loadProfiles(admin),
      loadClaimedUserIds(admin, campaignId),
    ])
    const recipients = selectEligibleRecipients({ authUsers, profiles, segment, now, excludeUserIds: claimed })
    return { ok: true, recipients, alreadySentCount: claimed.size }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load audience.' }
  }
}
