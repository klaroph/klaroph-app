/**
 * Server-only Founder Dock data. One parallel load per request (React cache), shared by
 * every dock page. Reads KlaroPH's own tables only — no user finances, no AI content.
 */

import { cache } from 'react'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { listMarketingCampaigns } from '@/lib/email/campaigns'
import { campaignSendsEnabled, isCampaignDeliveryConfigured } from '@/lib/email/campaignActions'
import {
  AUDIENCE_SEGMENTS,
  isValidMarketingEmail,
  loadAuthUsers,
  selectEligibleRecipients,
  type AudienceSegment,
} from '@/lib/email/marketingAudience'
import {
  buildAttention,
  buildFounderUsers,
  buildRecentActivity,
  campaignStatus,
  expiringPaidPro,
  summarizeAiUsage,
  summarizeCampaignSends,
  summarizeOpenSupport,
  summarizeRevenue,
  summarizeUsers,
  type ActivityEvent,
  type AiUsageRow,
  type AiUsageSummary,
  type AttentionItem,
  type CampaignDelivery,
  type CampaignSendRow,
  type CampaignStatus,
  type FounderProfile,
  type FounderSubscription,
  type PaymentEventRow,
  type RevenueSummary,
  type UserSummary,
} from '@/lib/founder/metrics'
import type { FounderUser } from '@/lib/founder/userList'

const PAGE_SIZE = 1000
const PAYMENT_FIELDS = 'payload->data->attributes->data->attributes'
const PAYMENT_SELECT = [
  'event_type',
  'processed_at',
  'livemode:payload->data->attributes->>livemode',
  `amount:${PAYMENT_FIELDS}->>amount`,
  `net_amount:${PAYMENT_FIELDS}->>net_amount`,
  `fee:${PAYMENT_FIELDS}->>fee`,
  `plan:${PAYMENT_FIELDS}->metadata->>plan`,
  `plan_type:${PAYMENT_FIELDS}->metadata->>plan_type`,
  `user_id:${PAYMENT_FIELDS}->metadata->>user_id`,
  `promo_code:${PAYMENT_FIELDS}->metadata->>promoCode`,
].join(',')

export type FounderCampaign = {
  id: string
  name: string
  subject: string
  previewText: string
  status: CampaignStatus
  delivery: CampaignDelivery
  eligible: Record<AudienceSegment, number>
}

export type FounderSnapshot = {
  now: string
  users: FounderUser[]
  userSummary: UserSummary
  expiringPro: FounderUser[]
  revenue: RevenueSummary
  campaigns: FounderCampaign[]
  ai: AiUsageSummary
  activity: { dau: number; wau: number; mau: number } | null
  authWithoutProfile: number | null
  openSupport: { count: number; oldestAt: string | null }
  database: { ok: boolean; latencyMs: number }
  config: {
    deliveryConfigured: boolean
    testEmailConfigured: boolean
    sendsEnabled: boolean
    paymongoConfigured: boolean
    paymongoWebhookConfigured: boolean
    aiConfigured: boolean
  }
  deployment: { environment: string | null; commit: string | null; message: string | null }
  attention: AttentionItem[]
  recentActivity: ActivityEvent[]
  /** Sources that failed to load; their numbers show as unavailable rather than zero. */
  unavailable: string[]
}

type Loaded<T> = { data: T; error: string | null }

async function settle<T>(label: string, fallback: T, load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await load(), error: null }
  } catch (e) {
    console.error(`[founder-dock] ${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    return { data: fallback, error: label }
  }
}

async function paged<T>(label: string, fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function loadSubscriptions(): Promise<FounderSubscription[]> {
  const [plans, subs] = await Promise.all([
    supabaseAdmin.from('plans').select('id, name'),
    paged<Omit<FounderSubscription, 'plan_name'>>('subscriptions', (from, to) =>
      supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan_id, status, current_period_end, grace_period_until, auto_renew, is_lifetime, payment_provider, plan_type')
        .order('user_id')
        .range(from, to)
    ),
  ])
  if (plans.error) throw new Error(`plans: ${plans.error.message}`)
  const planNames = new Map((plans.data ?? []).map((p) => [p.id as string, p.name as string]))
  return subs.map((s) => ({ ...s, plan_name: s.plan_id ? planNames.get(s.plan_id) ?? null : null }))
}

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now()
  const { error } = await supabaseAdmin.from('plans').select('id', { head: true, count: 'exact' })
  return { ok: !error, latencyMs: Date.now() - started }
}

async function loadActivityMetrics(): Promise<{ activity: FounderSnapshot['activity']; authWithoutProfile: number | null }> {
  const { data, error } = await supabaseAdmin.rpc('get_founder_metrics')
  if (error) throw new Error(`get_founder_metrics: ${error.message}`)
  const m = (data ?? {}) as { dau?: number; wau?: number; mau?: number; auth_audit?: { auth_without_profile?: number } }
  return {
    activity: { dau: m.dau ?? 0, wau: m.wau ?? 0, mau: m.mau ?? 0 },
    authWithoutProfile: m.auth_audit?.auth_without_profile ?? null,
  }
}

export const loadFounderSnapshot = cache(async (): Promise<FounderSnapshot> => {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const [authUsers, profiles, subscriptions, payments, sends, aiUsage, support, metrics, database] = await Promise.all([
    settle('Accounts', [], () => loadAuthUsers(supabaseAdmin)),
    settle('Profiles', [] as FounderProfile[], () =>
      paged<FounderProfile>('profiles', (from, to) =>
        supabaseAdmin
          .from('profiles')
          .select('id, full_name, nickname, user_type, created_at, marketing_emails_unsubscribed_at')
          .order('id')
          .range(from, to)
      )
    ),
    settle('Subscriptions', [] as FounderSubscription[], loadSubscriptions),
    settle('Payments', [] as PaymentEventRow[], () =>
      paged<PaymentEventRow>('payment_events', (from, to) =>
        supabaseAdmin.from('payment_events').select(PAYMENT_SELECT).order('processed_at').range(from, to)
      )
    ),
    settle('Campaign sends', [] as (CampaignSendRow & { user_id: string })[], () =>
      paged<CampaignSendRow & { user_id: string }>('marketing_email_sends', (from, to) =>
        supabaseAdmin.from('marketing_email_sends').select('campaign_id, user_id, status, sent_at').order('user_id').range(from, to)
      )
    ),
    settle('AI usage', [] as AiUsageRow[], async () => {
      const { data, error } = await supabaseAdmin
        .from('klaro_ai_usage')
        .select('user_id, usage_date, generation_count, feature')
        .eq('usage_date', today)
      if (error) throw new Error(error.message)
      return (data ?? []) as AiUsageRow[]
    }),
    settle('Support requests', [] as { user_id: string | null; created_at: string }[], async () => {
      const { data, error } = await supabaseAdmin.from('support_requests').select('user_id, created_at').eq('status', 'open')
      if (error) throw new Error(error.message)
      return (data ?? []) as { user_id: string | null; created_at: string }[]
    }),
    settle('Activity metrics', { activity: null, authWithoutProfile: null } as Awaited<ReturnType<typeof loadActivityMetrics>>, loadActivityMetrics),
    checkDatabase().catch(() => ({ ok: false, latencyMs: 0 })),
  ])

  const users = buildFounderUsers({ authUsers: authUsers.data, profiles: profiles.data, subscriptions: subscriptions.data, now })
  const realUserIds = new Set(users.filter((u) => !u.isTester).map((u) => u.id))
  const testerIds = new Set(users.filter((u) => u.isTester).map((u) => u.id))
  const revenue = summarizeRevenue(payments.data, realUserIds, testerIds, now)
  const expiringPro = expiringPaidPro(users, now)

  const campaigns: FounderCampaign[] = listMarketingCampaigns().map((c) => {
    const delivery = summarizeCampaignSends(sends.data, c.id)
    const claimed = new Set(sends.data.filter((s) => s.campaign_id === c.id).map((s) => s.user_id))
    const eligible = Object.fromEntries(
      AUDIENCE_SEGMENTS.map((segment) => [
        segment,
        selectEligibleRecipients({ authUsers: authUsers.data, profiles: profiles.data, segment, now, excludeUserIds: claimed }).length,
      ])
    ) as Record<AudienceSegment, number>
    return { id: c.id, name: c.name, subject: c.subject, previewText: c.previewText, status: campaignStatus(delivery), delivery, eligible }
  })

  const config: FounderSnapshot['config'] = {
    deliveryConfigured: isCampaignDeliveryConfigured(),
    testEmailConfigured: isValidMarketingEmail(process.env.MARKETING_TEST_EMAIL?.trim().toLowerCase()),
    sendsEnabled: campaignSendsEnabled(),
    paymongoConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
    paymongoWebhookConfigured: Boolean(process.env.PAYMONGO_WEBHOOK_SECRET),
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  }

  const openSupport = summarizeOpenSupport(support.data, testerIds)

  return {
    now: now.toISOString(),
    users,
    userSummary: summarizeUsers(users),
    expiringPro,
    revenue,
    campaigns,
    ai: summarizeAiUsage(aiUsage.data, new Map(users.map((u) => [u.id, u.plan])), now),
    activity: metrics.data.activity,
    authWithoutProfile: metrics.data.authWithoutProfile,
    openSupport,
    database,
    config,
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] ?? null,
    },
    attention: buildAttention({
      now,
      databaseOk: database.ok,
      openSupport,
      failedPaymentsLast7: revenue.failedLast7,
      expiringPaidPro: expiringPro.length,
      deliveryConfigured: config.deliveryConfigured,
      sendsEnabled: config.sendsEnabled,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, delivery: c.delivery, eligible: c.eligible.all })),
    }),
    recentActivity: buildRecentActivity({ users, purchases: revenue.recent, campaigns }),
    unavailable: [authUsers, profiles, subscriptions, payments, sends, aiUsage, support, metrics]
      .map((r) => r.error)
      .filter((e): e is string => e !== null),
  }
})
