/**
 * Server-only weekly summary. Recipients are opted-in users (confirmed email,
 * not a tester, not banned or deleted, not unsubscribed, onboarding completed),
 * then people who logged something in the covered Manila week.
 * The message itself never includes amounts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { displayName } from '@/lib/displayName'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CampaignLinkConfig, CampaignSendSummary } from '@/lib/email/campaignSender'
import { sendClaimedRecipients } from '@/lib/email/campaignSender'
import {
  isValidMarketingEmail,
  loadMarketingAudience,
  selectEligibleRecipients,
  type AudienceAuthUser,
  type AudienceProfile,
  type MarketingRecipient,
} from '@/lib/email/marketingAudience'
import { manilaWeekWindow, weeklyCampaignId, manilaDateInRange, type ManilaWeekWindow } from '@/lib/email/manilaWeek'
import { getResendConfig, sendCampaignBatch, type ResendConfig } from '@/lib/email/resend'
import { getUnsubscribeSecret } from '@/lib/email/unsubscribeToken'
import {
  buildWeeklySummaryMessage,
  partitionWeeklyActivity,
  type LedgerEntry,
  type WeeklySummaryFacts,
} from '@/lib/email/weeklySummaryEmail'

/** Test sends use a token for a non-existent user, so the unsubscribe link is inert. */
const TEST_RECIPIENT_USER_ID = '00000000-0000-0000-0000-000000000000'
const PAGE_SIZE = 1000

const TEST_FACTS: WeeklySummaryFacts = { entryCount: 3, direction: 'same', topCategory: 'Groceries' }

export type WeeklyProfile = AudienceProfile & { onboarding_completed?: boolean | null }

export type WeeklyRecipient = MarketingRecipient & { greetingName: string | null }

export type WeeklyPrepareResult =
  | { ok: true; window: ManilaWeekWindow; campaignId: string; recipients: WeeklyRecipient[]; entries: LedgerEntry[] }
  | { ok: false; error: string }

export type WeeklySummaryBody = {
  ok?: boolean
  error?: string
  mode?: 'test'
  sendsEnabled?: boolean
  campaignId?: string
  eligible?: number
  skippedNoActivity?: number
  wouldSend?: number
  sent?: number
  failed?: number
  skipped?: number
}

export type WeeklySummaryOutcome = { status: number; body: WeeklySummaryBody }

type ProfileBits = {
  id: string
  nickname: string | null
  full_name: string | null
  onboarding_completed: boolean | null
}

type ExpenseRow = {
  user_id?: string
  date?: string
  category?: string | null
  amount?: number | string | null
}

type IncomeRow = { user_id?: string; date?: string }

export function weeklySummarySendsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WEEKLY_SUMMARY_SENDS_ENABLED === 'true'
}

export function keepOnboarded<T extends { userId: string }>(
  recipients: readonly T[],
  profiles: readonly { id: string; onboarding_completed?: boolean | null }[],
): T[] {
  const onboarded = new Set(profiles.filter((profile) => profile.onboarding_completed === true).map((profile) => profile.id))
  return recipients.filter((recipient) => onboarded.has(recipient.userId))
}

/**
 * Marketing audience with every existing eligibility filter except the 30-day
 * sign-in window, plus onboarding_completed === true.
 */
export function selectWeeklyRecipients(input: {
  authUsers: AudienceAuthUser[]
  profiles: WeeklyProfile[]
  now: Date
  excludeUserIds?: ReadonlySet<string>
}): MarketingRecipient[] {
  return keepOnboarded(
    selectEligibleRecipients({
      authUsers: input.authUsers,
      profiles: input.profiles,
      segment: 'all',
      now: input.now,
      excludeUserIds: input.excludeUserIds,
    }),
    input.profiles,
  )
}

export function weeklyGreetingName(
  profile: { nickname?: string | null; full_name?: string | null } | undefined,
  email: string,
): string | null {
  const name = displayName({ nickname: profile?.nickname, fullName: profile?.full_name, email }, '', { firstName: true })
  return name || null
}

function deliveryConfig(
  env: Record<string, string | undefined>,
): { ok: true; resend: ResendConfig; links: CampaignLinkConfig } | { ok: false; error: string } {
  const resend = getResendConfig(env)
  if (!resend.ok) return resend
  const unsubscribeSecret = getUnsubscribeSecret(env)
  if (!unsubscribeSecret) return { ok: false, error: 'MARKETING_UNSUBSCRIBE_SECRET is missing or too short.' }
  const appUrl = (env.NEXT_PUBLIC_APP_URL || 'https://klaroph.com').replace(/\/+$/, '')
  return { ok: true, resend: resend.config, links: { appUrl, unsubscribeSecret } }
}

async function eachPage<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function loadProfileBits(admin: SupabaseClient, userIds: readonly string[]): Promise<ProfileBits[]> {
  if (userIds.length === 0) return []
  const ids = [...userIds]
  return eachPage((from, to) =>
    admin
      .from('profiles')
      .select('id, nickname, full_name, onboarding_completed')
      .in('id', ids)
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/** Expenses across both weeks, income in the covered week. Explicit user_id filter, then date bounds. */
export async function loadWeekEntries(
  admin: SupabaseClient,
  userIds: readonly string[],
  window: ManilaWeekWindow,
): Promise<LedgerEntry[]> {
  if (userIds.length === 0) return []
  const ids = [...userIds]
  const allowed = new Set(ids)
  const [expenses, income] = await Promise.all([
    eachPage<ExpenseRow>((from, to) =>
      admin
        .from('expenses')
        .select('id, user_id, date, category, amount')
        .in('user_id', ids)
        .gte('date', window.previous.start)
        .lte('date', window.covered.end)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    eachPage<IncomeRow>((from, to) =>
      admin
        .from('income_records')
        .select('id, user_id, date')
        .in('user_id', ids)
        .gte('date', window.covered.start)
        .lte('date', window.covered.end)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const entries: LedgerEntry[] = []
  for (const row of expenses) {
    if (!row.user_id || !row.date || !allowed.has(row.user_id)) continue
    const inCovered = manilaDateInRange(row.date, window.covered)
    const inPrevious = manilaDateInRange(row.date, window.previous)
    if (!inCovered && !inPrevious) continue
    entries.push({
      userId: row.user_id,
      date: row.date,
      kind: 'expense',
      category: row.category ?? null,
      amount: row.amount,
    })
  }
  for (const row of income) {
    if (!row.user_id || !row.date || !allowed.has(row.user_id)) continue
    if (!manilaDateInRange(row.date, window.covered)) continue
    entries.push({ userId: row.user_id, date: row.date, kind: 'income' })
  }
  return entries
}

async function prepareWeeklySend(admin: SupabaseClient, now: Date): Promise<WeeklyPrepareResult> {
  const window = manilaWeekWindow(now)
  const campaignId = weeklyCampaignId(window)
  try {
    const audience = await loadMarketingAudience(admin, campaignId, 'all', now)
    if (!audience.ok) return { ok: false, error: audience.error }
    const profiles = await loadProfileBits(admin, audience.recipients.map((recipient) => recipient.userId))
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    const recipients: WeeklyRecipient[] = keepOnboarded(audience.recipients, profiles).map((recipient) => ({
      ...recipient,
      greetingName: weeklyGreetingName(byId.get(recipient.userId), recipient.email),
    }))
    const entries = await loadWeekEntries(admin, recipients.map((recipient) => recipient.userId), window)
    return { ok: true, window, campaignId, recipients, entries }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load the weekly summary.' }
  }
}

export async function deliverWeeklyBatch(
  deps: { admin: SupabaseClient; resend: ResendConfig; links: CampaignLinkConfig; sendBatch?: typeof sendCampaignBatch; pause?: (ms: number) => Promise<void> },
  campaignId: string,
  batch: readonly { recipient: WeeklyRecipient; facts: WeeklySummaryFacts }[],
): Promise<CampaignSendSummary> {
  const byId = new Map(batch.map((item) => [item.recipient.userId, item]))
  return sendClaimedRecipients(
    deps,
    campaignId,
    batch.map((item) => item.recipient),
    (recipient) => {
      const item = byId.get(recipient.userId)
      if (!item) throw new Error('missing weekly summary')
      return buildWeeklySummaryMessage(item.facts, item.recipient, deps.links, campaignId)
    },
  )
}

export type WeeklySummaryDeps = {
  env?: Record<string, string | undefined>
  admin?: SupabaseClient
  prepare?: (now: Date) => Promise<WeeklyPrepareResult>
  deliver?: (
    campaignId: string,
    batch: { recipient: WeeklyRecipient; facts: WeeklySummaryFacts }[],
  ) => Promise<CampaignSendSummary>
}

export async function runWeeklySummary(now: Date, deps: WeeklySummaryDeps = {}): Promise<WeeklySummaryOutcome> {
  const env = deps.env ?? process.env
  const prepare = deps.prepare ?? ((at: Date) => prepareWeeklySend(deps.admin ?? supabaseAdmin, at))
  const prepared = await prepare(now)
  if (!prepared.ok) {
    console.error(`[weekly-summary] ${prepared.error}`)
    return { status: 500, body: { error: 'Failed to load the weekly summary.' } }
  }

  const { skippedNoActivity, wouldSend } = partitionWeeklyActivity(prepared.recipients, prepared.entries, prepared.window)
  const sendsEnabled = weeklySummarySendsEnabled(env)
  const counts: WeeklySummaryBody = {
    ok: true,
    sendsEnabled,
    campaignId: prepared.campaignId,
    eligible: prepared.recipients.length,
    skippedNoActivity: skippedNoActivity.length,
    wouldSend: wouldSend.length,
  }

  if (!sendsEnabled || wouldSend.length === 0) {
    console.info(
      `[weekly-summary ${prepared.campaignId}] sendsEnabled=${sendsEnabled} eligible=${counts.eligible} skippedNoActivity=${counts.skippedNoActivity} wouldSend=${counts.wouldSend}`,
    )
    return { status: 200, body: counts }
  }

  try {
    const summary = deps.deliver
      ? await deps.deliver(prepared.campaignId, wouldSend)
      : await deliverConfigured(env, deps.admin ?? supabaseAdmin, prepared.campaignId, wouldSend)
    if ('configError' in summary) {
      console.error(`[weekly-summary ${prepared.campaignId}] ${summary.configError}`)
      return { status: 500, body: { error: summary.configError } }
    }
    console.info(`[weekly-summary ${prepared.campaignId}] sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`)
    return { status: 200, body: { ...counts, ...summary } }
  } catch (e) {
    console.error(`[weekly-summary ${prepared.campaignId}] ${e instanceof Error ? e.message : 'send failed'}`)
    return { status: 500, body: { error: 'Weekly summary send failed.' } }
  }
}

async function deliverConfigured(
  env: Record<string, string | undefined>,
  admin: SupabaseClient,
  campaignId: string,
  batch: { recipient: WeeklyRecipient; facts: WeeklySummaryFacts }[],
): Promise<CampaignSendSummary | { configError: string }> {
  const config = deliveryConfig(env)
  if (!config.ok) return { configError: config.error }
  return deliverWeeklyBatch({ admin, resend: config.resend, links: config.links }, campaignId, batch)
}

/** One [TEST] message to MARKETING_TEST_EMAIL. The address is never taken from the caller. */
export async function sendWeeklySummaryTest(
  now: Date,
  options?: { env?: Record<string, string | undefined>; sendBatch?: typeof sendCampaignBatch },
): Promise<WeeklySummaryOutcome> {
  const env = options?.env ?? process.env
  const testEmail = env.MARKETING_TEST_EMAIL?.trim().toLowerCase()
  if (!isValidMarketingEmail(testEmail)) {
    return { status: 400, body: { error: 'MARKETING_TEST_EMAIL is not configured.' } }
  }
  const config = deliveryConfig(env)
  if (!config.ok) return { status: 500, body: { error: config.error } }

  const campaignId = weeklyCampaignId(manilaWeekWindow(now))
  const message = buildWeeklySummaryMessage(
    TEST_FACTS,
    { userId: TEST_RECIPIENT_USER_ID, email: testEmail, greetingName: null },
    config.links,
    campaignId,
  )
  const sendBatch = options?.sendBatch ?? sendCampaignBatch
  const result = await sendBatch(
    config.resend,
    [{ ...message, subject: `[TEST] ${message.subject}` }],
    `${campaignId}-test-${Date.now()}`,
  )
  if (!result.ok) {
    console.error(`[weekly-summary ${campaignId}] test send failed: ${result.error}`)
    return { status: 502, body: { error: 'Test send failed.' } }
  }
  return { status: 200, body: { ok: true, mode: 'test' } }
}
