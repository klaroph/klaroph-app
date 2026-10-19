/**
 * Server-only payday summary. Recipients are opted-in users (confirmed email,
 * not a tester, not banned or deleted, not unsubscribed, onboarding completed),
 * then people who logged something in the covered Manila half-month.
 * The message itself never includes amounts.
 *
 * The send flag stays WEEKLY_SUMMARY_SENDS_ENABLED so existing env does not change.
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
import { manilaDateInRange, manilaHalfMonth, paydayCampaignId, type ManilaHalfMonthWindow } from '@/lib/email/manilaHalfMonth'
import { getResendConfig, sendCampaignBatch, type ResendConfig } from '@/lib/email/resend'
import { getUnsubscribeSecret } from '@/lib/email/unsubscribeToken'
import {
  buildPaydaySummaryMessage,
  partitionPaydayActivity,
  type LedgerEntry,
  type PaydaySummaryFacts,
} from '@/lib/email/paydaySummaryEmail'

/** Test sends use a token for a non-existent user, so the unsubscribe link is inert. */
const TEST_RECIPIENT_USER_ID = '00000000-0000-0000-0000-000000000000'
const PAGE_SIZE = 1000
const SAMPLE_LOGGED_DAYS = 8

export type PaydayProfile = AudienceProfile & { onboarding_completed?: boolean | null }

export type PaydayRecipient = MarketingRecipient & { greetingName: string | null }

export type PaydayPrepareResult =
  | { ok: true; window: ManilaHalfMonthWindow; campaignId: string; recipients: PaydayRecipient[]; entries: LedgerEntry[] }
  | { ok: false; error: string }

export type PaydaySummaryBody = {
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
  /** Already-claimed count after a send, or the literal skip when today is not a payday. */
  skipped?: number | 'not-payday'
}

export type PaydaySummaryOutcome = { status: number; body: PaydaySummaryBody }

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

export function paydaySummarySendsEnabled(env: Record<string, string | undefined> = process.env): boolean {
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
export function selectPaydayRecipients(input: {
  authUsers: AudienceAuthUser[]
  profiles: PaydayProfile[]
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

export function paydayGreetingName(
  profile: { nickname?: string | null; full_name?: string | null } | undefined,
  email: string,
): string | null {
  const name = displayName({ nickname: profile?.nickname, fullName: profile?.full_name, email }, '', { firstName: true })
  return name || null
}

function sampleFacts(window: ManilaHalfMonthWindow | null): PaydaySummaryFacts {
  const windowDays = window?.dayCount ?? 15
  return { loggedDays: Math.min(SAMPLE_LOGGED_DAYS, windowDays), windowDays, topCategory: 'Groceries' }
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

/** Income and expenses inside the covered half-month only. Explicit user_id filter, then date bounds. */
export async function loadPaydayEntries(
  admin: SupabaseClient,
  userIds: readonly string[],
  window: ManilaHalfMonthWindow,
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
        .gte('date', window.covered.start)
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
    if (!manilaDateInRange(row.date, window.covered)) continue
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

async function preparePaydaySend(admin: SupabaseClient, now: Date): Promise<PaydayPrepareResult> {
  const window = manilaHalfMonth(now)
  if (!window) return { ok: false, error: 'not-payday' }
  const campaignId = paydayCampaignId(window)
  try {
    const audience = await loadMarketingAudience(admin, campaignId, 'all', now)
    if (!audience.ok) return { ok: false, error: audience.error }
    const profiles = await loadProfileBits(admin, audience.recipients.map((recipient) => recipient.userId))
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    const recipients: PaydayRecipient[] = keepOnboarded(audience.recipients, profiles).map((recipient) => ({
      ...recipient,
      greetingName: paydayGreetingName(byId.get(recipient.userId), recipient.email),
    }))
    const entries = await loadPaydayEntries(admin, recipients.map((recipient) => recipient.userId), window)
    return { ok: true, window, campaignId, recipients, entries }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load the payday summary.' }
  }
}

export async function deliverPaydayBatch(
  deps: { admin: SupabaseClient; resend: ResendConfig; links: CampaignLinkConfig; sendBatch?: typeof sendCampaignBatch; pause?: (ms: number) => Promise<void> },
  campaignId: string,
  batch: readonly { recipient: PaydayRecipient; facts: PaydaySummaryFacts }[],
): Promise<CampaignSendSummary> {
  const byId = new Map(batch.map((item) => [item.recipient.userId, item]))
  return sendClaimedRecipients(
    deps,
    campaignId,
    batch.map((item) => item.recipient),
    (recipient) => {
      const item = byId.get(recipient.userId)
      if (!item) throw new Error('missing payday summary')
      return buildPaydaySummaryMessage(item.facts, item.recipient, deps.links, campaignId)
    },
  )
}

export type PaydaySummaryDeps = {
  env?: Record<string, string | undefined>
  admin?: SupabaseClient
  prepare?: (now: Date) => Promise<PaydayPrepareResult>
  deliver?: (
    campaignId: string,
    batch: { recipient: PaydayRecipient; facts: PaydaySummaryFacts }[],
  ) => Promise<CampaignSendSummary>
}

export async function runPaydaySummary(now: Date, deps: PaydaySummaryDeps = {}): Promise<PaydaySummaryOutcome> {
  const window = manilaHalfMonth(now)
  if (!window) return { status: 200, body: { skipped: 'not-payday' } }

  const env = deps.env ?? process.env
  const prepare = deps.prepare ?? ((at: Date) => preparePaydaySend(deps.admin ?? supabaseAdmin, at))
  const prepared = await prepare(now)
  if (!prepared.ok) {
    console.error(`[payday-summary] ${prepared.error}`)
    return { status: 500, body: { error: 'Failed to load the payday summary.' } }
  }

  const { skippedNoActivity, wouldSend } = partitionPaydayActivity(prepared.recipients, prepared.entries, prepared.window)
  const sendsEnabled = paydaySummarySendsEnabled(env)
  const counts: PaydaySummaryBody = {
    ok: true,
    sendsEnabled,
    campaignId: prepared.campaignId,
    eligible: prepared.recipients.length,
    skippedNoActivity: skippedNoActivity.length,
    wouldSend: wouldSend.length,
  }

  if (!sendsEnabled || wouldSend.length === 0) {
    console.info(
      `[payday-summary ${prepared.campaignId}] sendsEnabled=${sendsEnabled} eligible=${counts.eligible} skippedNoActivity=${counts.skippedNoActivity} wouldSend=${counts.wouldSend}`,
    )
    return { status: 200, body: counts }
  }

  try {
    const summary = deps.deliver
      ? await deps.deliver(prepared.campaignId, wouldSend)
      : await deliverConfigured(env, deps.admin ?? supabaseAdmin, prepared.campaignId, wouldSend)
    if ('configError' in summary) {
      console.error(`[payday-summary ${prepared.campaignId}] ${summary.configError}`)
      return { status: 500, body: { error: summary.configError } }
    }
    console.info(`[payday-summary ${prepared.campaignId}] sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`)
    return { status: 200, body: { ...counts, ...summary } }
  } catch (e) {
    console.error(`[payday-summary ${prepared.campaignId}] ${e instanceof Error ? e.message : 'send failed'}`)
    return { status: 500, body: { error: 'Payday summary send failed.' } }
  }
}

async function deliverConfigured(
  env: Record<string, string | undefined>,
  admin: SupabaseClient,
  campaignId: string,
  batch: { recipient: PaydayRecipient; facts: PaydaySummaryFacts }[],
): Promise<CampaignSendSummary | { configError: string }> {
  const config = deliveryConfig(env)
  if (!config.ok) return { configError: config.error }
  return deliverPaydayBatch({ admin, resend: config.resend, links: config.links }, campaignId, batch)
}

/** One [TEST] message to MARKETING_TEST_EMAIL. The address is never taken from the caller. */
export async function sendPaydaySummaryTest(
  now: Date,
  options?: { env?: Record<string, string | undefined>; sendBatch?: typeof sendCampaignBatch },
): Promise<PaydaySummaryOutcome> {
  const env = options?.env ?? process.env
  const testEmail = env.MARKETING_TEST_EMAIL?.trim().toLowerCase()
  if (!isValidMarketingEmail(testEmail)) {
    return { status: 400, body: { error: 'MARKETING_TEST_EMAIL is not configured.' } }
  }
  const config = deliveryConfig(env)
  if (!config.ok) return { status: 500, body: { error: config.error } }

  const window = manilaHalfMonth(now)
  const campaignId = window ? paydayCampaignId(window) : 'payday-summary-test'
  const message = buildPaydaySummaryMessage(
    sampleFacts(window),
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
    console.error(`[payday-summary ${campaignId}] test send failed: ${result.error}`)
    return { status: 502, body: { error: 'Test send failed.' } }
  }
  return { status: 200, body: { ok: true, mode: 'test' } }
}
