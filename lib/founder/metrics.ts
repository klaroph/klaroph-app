/**
 * Founder Dock calculations. Pure functions over rows loaded by lib/founder/data.ts,
 * so every number on the dock has one tested definition.
 */

import { normalizeSubscriptionFromRow, type SubscriptionStateRow } from '@/lib/subscriptionStateCore'
import { ACTIVE_WINDOW_DAYS } from '@/lib/email/marketingAudience'
import { dailyLimitForPlan } from '@/lib/ai/limits'
import { chatDailyLimitForPlan } from '@/lib/ai/chatLimits'
import { isPro, type AccountStatus, type FounderUser, type PlanKind } from '@/lib/founder/userList'

const DAY_MS = 24 * 60 * 60 * 1000
export const NEW_USER_DAYS = 7
export const EXPIRING_SOON_DAYS = 7
export const REVENUE_WINDOW_DAYS = 30
const PRO_PLAN_NAMES = new Set(['pro', 'clarity_premium'])

// ---------------------------------------------------------------- Users

export type FounderAuthUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  last_sign_in_at?: string | null
  banned_until?: string | null
  deleted_at?: string | null
}

export type FounderProfile = {
  id: string
  full_name: string | null
  nickname: string | null
  user_type: string
  created_at: string
  marketing_emails_unsubscribed_at: string | null
}

export type FounderSubscription = SubscriptionStateRow & {
  user_id: string
  plan_name: string | null
  payment_provider: string | null
  plan_type: string | null
}

/** Same entitlement rule as the app (lifetime ignores period end; grace still counts as Pro). */
export function planKind(sub: FounderSubscription | undefined, now: Date): PlanKind {
  if (!sub || !sub.plan_name || !PRO_PLAN_NAMES.has(sub.plan_name)) return 'free'
  const { state } = normalizeSubscriptionFromRow(sub, now)
  if (state !== 'ACTIVE' && state !== 'GRACE') return 'free'
  if (sub.is_lifetime) return 'lifetime'
  return sub.payment_provider === 'paymongo' ? 'paid' : 'complimentary'
}

function realName(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed && !trimmed.includes('@') ? trimmed : null
}

export function displayName(profile: Pick<FounderProfile, 'nickname' | 'full_name'>): string | null {
  return realName(profile.nickname) ?? realName(profile.full_name)
}

function accountStatus(user: FounderAuthUser, now: Date): AccountStatus {
  if (user.banned_until && Date.parse(user.banned_until) > now.getTime()) return 'banned'
  if (!user.email_confirmed_at) return 'unconfirmed'
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN
  return Number.isFinite(lastSignIn) && now.getTime() - lastSignIn <= ACTIVE_WINDOW_DAYS * DAY_MS
    ? 'active'
    : 'dormant'
}

export function buildFounderUsers(input: {
  authUsers: FounderAuthUser[]
  profiles: FounderProfile[]
  subscriptions: FounderSubscription[]
  now: Date
}): FounderUser[] {
  const authById = new Map(input.authUsers.map((u) => [u.id, u]))
  const subByUser = new Map(input.subscriptions.map((s) => [s.user_id, s]))
  const users: FounderUser[] = []

  for (const profile of input.profiles) {
    const auth = authById.get(profile.id)
    if (!auth || auth.deleted_at) continue
    const sub = subByUser.get(profile.id)
    const plan = planKind(sub, input.now)
    const planType = sub?.plan_type === 'monthly' || sub?.plan_type === 'annual' ? sub.plan_type : null
    const name = displayName(profile)
    const fullName = realName(profile.full_name)
    const timeLimited = plan === 'paid' || plan === 'complimentary'
    users.push({
      id: profile.id,
      name,
      fullName: fullName !== name ? fullName : null,
      email: auth.email ?? '',
      isTester: profile.user_type !== 'user',
      plan,
      planType: plan === 'paid' ? planType : null,
      proEndsAt: timeLimited ? sub?.current_period_end ?? null : null,
      signedUpAt: profile.created_at,
      lastSignInAt: auth.last_sign_in_at ?? null,
      status: accountStatus(auth, input.now),
      isNew: input.now.getTime() - Date.parse(profile.created_at) <= NEW_USER_DAYS * DAY_MS,
      unsubscribed: Boolean(profile.marketing_emails_unsubscribed_at),
    })
  }

  return users.sort((a, b) => Date.parse(b.signedUpAt) - Date.parse(a.signedUpAt))
}

export type UserSummary = {
  total: number
  active: number
  newThisWeek: number
  unsubscribed: number
  pro: { total: number; paid: number; lifetime: number; complimentary: number }
}

/** Real customers only — testers never count toward founder numbers. */
export function summarizeUsers(users: FounderUser[]): UserSummary {
  const summary: UserSummary = {
    total: 0,
    active: 0,
    newThisWeek: 0,
    unsubscribed: 0,
    pro: { total: 0, paid: 0, lifetime: 0, complimentary: 0 },
  }
  for (const u of users) {
    if (u.isTester) continue
    summary.total++
    if (u.status === 'active') summary.active++
    if (u.isNew) summary.newThisWeek++
    if (u.unsubscribed) summary.unsubscribed++
    if (isPro(u.plan)) {
      summary.pro.total++
      summary.pro[u.plan as Exclude<PlanKind, 'free'>]++
    }
  }
  return summary
}

export function expiringPaidPro(users: FounderUser[], now: Date): FounderUser[] {
  const horizon = now.getTime() + EXPIRING_SOON_DAYS * DAY_MS
  return users.filter((u) => {
    if (u.isTester || u.plan !== 'paid' || !u.proEndsAt) return false
    const end = Date.parse(u.proEndsAt)
    return end > now.getTime() && end <= horizon
  })
}

// ---------------------------------------------------------------- Revenue

/** Flattened payment_events row: only the payload fields the dock needs (no billing details). */
export type PaymentEventRow = {
  event_type: string
  processed_at: string
  livemode: string | null
  amount: string | null
  net_amount: string | null
  fee: string | null
  plan: string | null
  plan_type: string | null
  user_id: string | null
  promo_code: string | null
}

export type RevenueTotals = { gross: number; net: number; fees: number; count: number }
export type RevenuePurchase = { at: string; planType: 'monthly' | 'annual'; amount: number; promo: boolean }

export type RevenueSummary = {
  allTime: RevenueTotals
  last30: RevenueTotals
  recent: RevenuePurchase[]
  failedLast7: number
  lastWebhookAt: string | null
}

const centavos = (v: string | null) => (v ? Number(v) || 0 : 0)
const emptyTotals = (): RevenueTotals => ({ gross: 0, net: 0, fees: 0, count: 0 })

function addTo(totals: RevenueTotals, e: PaymentEventRow) {
  totals.gross += centavos(e.amount) / 100
  totals.net += centavos(e.net_amount) / 100
  totals.fees += centavos(e.fee) / 100
  totals.count++
}

/**
 * Collected revenue = live PayMongo payment.paid events for KlaroPH Pro, paid by real
 * (non-tester) accounts. Test-mode events and founder test payments are excluded.
 */
export function summarizeRevenue(events: PaymentEventRow[], realUserIds: ReadonlySet<string>, now: Date): RevenueSummary {
  const summary: RevenueSummary = {
    allTime: emptyTotals(),
    last30: emptyTotals(),
    recent: [],
    failedLast7: 0,
    lastWebhookAt: null,
  }
  const since30 = now.getTime() - REVENUE_WINDOW_DAYS * DAY_MS
  const since7 = now.getTime() - 7 * DAY_MS

  for (const e of events) {
    const at = Date.parse(e.processed_at)
    if (!summary.lastWebhookAt || at > Date.parse(summary.lastWebhookAt)) summary.lastWebhookAt = e.processed_at
    if (e.livemode !== 'true') continue
    if (e.event_type === 'payment.failed' && at >= since7) summary.failedLast7++
    if (e.event_type !== 'payment.paid' || e.plan !== 'pro' || !e.user_id || !realUserIds.has(e.user_id)) continue

    addTo(summary.allTime, e)
    if (at >= since30) addTo(summary.last30, e)
    summary.recent.push({
      at: e.processed_at,
      planType: e.plan_type === 'annual' ? 'annual' : 'monthly',
      amount: centavos(e.amount) / 100,
      promo: Boolean(e.promo_code),
    })
  }

  summary.recent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return summary
}

// ---------------------------------------------------------------- Marketing

export type CampaignSendRow = { campaign_id: string; status: string; sent_at: string | null }
export type CampaignDelivery = { sent: number; pending: number; lastSentAt: string | null }

export function summarizeCampaignSends(rows: CampaignSendRow[], campaignId: string): CampaignDelivery {
  const delivery: CampaignDelivery = { sent: 0, pending: 0, lastSentAt: null }
  for (const r of rows) {
    if (r.campaign_id !== campaignId) continue
    if (r.status === 'sent') {
      delivery.sent++
      if (r.sent_at && (!delivery.lastSentAt || r.sent_at > delivery.lastSentAt)) delivery.lastSentAt = r.sent_at
    } else if (r.status === 'pending') {
      delivery.pending++
    }
  }
  return delivery
}

export type CampaignStatus = 'draft' | 'sending' | 'sent'

export function campaignStatus(delivery: CampaignDelivery): CampaignStatus {
  if (delivery.pending > 0) return 'sending'
  return delivery.sent > 0 ? 'sent' : 'draft'
}

// ---------------------------------------------------------------- AI usage

export type AiUsageRow = { user_id: string; usage_date: string; generation_count: number; feature: string }
export type AiUsageSummary = {
  requestsToday: number
  byFeature: Record<string, number>
  freeRequests: number
  proRequests: number
  usersToday: number
  usersAtLimit: number
}

/** Counts are per UTC day, matching how klaro_ai_usage enforces limits. */
export function summarizeAiUsage(
  rows: AiUsageRow[],
  planByUser: ReadonlyMap<string, PlanKind>,
  now: Date
): AiUsageSummary {
  const today = now.toISOString().slice(0, 10)
  const summary: AiUsageSummary = { requestsToday: 0, byFeature: {}, freeRequests: 0, proRequests: 0, usersToday: 0, usersAtLimit: 0 }
  const users = new Set<string>()
  const atLimit = new Set<string>()

  for (const r of rows) {
    if (r.usage_date !== today) continue
    const tier = isPro(planByUser.get(r.user_id) ?? 'free') ? 'pro' : 'free'
    summary.requestsToday += r.generation_count
    summary.byFeature[r.feature] = (summary.byFeature[r.feature] ?? 0) + r.generation_count
    if (tier === 'pro') summary.proRequests += r.generation_count
    else summary.freeRequests += r.generation_count
    users.add(r.user_id)
    const limit = r.feature === 'chat' ? chatDailyLimitForPlan(tier) : dailyLimitForPlan(tier)
    if (r.generation_count >= limit) atLimit.add(r.user_id)
  }

  summary.usersToday = users.size
  summary.usersAtLimit = atLimit.size
  return summary
}

// ---------------------------------------------------------------- Attention

/** Real customers only: tester requests stay in the Support Inbox but never count toward Attention. */
export function summarizeOpenSupport(
  openRequests: { user_id: string | null; created_at: string }[],
  testerIds: ReadonlySet<string>
): { count: number; oldestAt: string | null } {
  const real = openRequests
    .filter((r) => !(r.user_id && testerIds.has(r.user_id)))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  return { count: real.length, oldestAt: real[0]?.created_at ?? null }
}

export type AttentionTone = 'critical' | 'warning' | 'info'
export type AttentionItem = { id: string; tone: AttentionTone; title: string; detail: string; href?: string }

export type AttentionInput = {
  now: Date
  databaseOk: boolean
  openSupport: { count: number; oldestAt: string | null }
  failedPaymentsLast7: number
  expiringPaidPro: number
  deliveryConfigured: boolean
  sendsEnabled: boolean
  campaigns: { id: string; name: string; delivery: CampaignDelivery; eligible: number }[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Only conditions that need a founder decision. An empty list means "no action needed". */
export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []

  if (!input.databaseOk) {
    items.push({ id: 'database', tone: 'critical', title: 'Database check failed', detail: 'The Founder Dock could not read from Supabase.', href: '/admin/founder/health' })
  }

  for (const c of input.campaigns) {
    if (c.delivery.pending > 0) {
      items.push({
        id: `campaign-pending-${c.id}`,
        tone: 'critical',
        title: `${plural(c.delivery.pending, 'recipient')} stuck in pending`,
        detail: `${c.name}: these users are blocked from this campaign until reviewed.`,
        href: '/admin/founder/marketing',
      })
    }
  }

  if (input.failedPaymentsLast7 > 0) {
    items.push({ id: 'failed-payments', tone: 'warning', title: `${plural(input.failedPaymentsLast7, 'failed payment')} this week`, detail: 'Live PayMongo payment.failed events in the last 7 days.', href: '/admin/founder/revenue' })
  }

  if (input.openSupport.count > 0) {
    const days = input.openSupport.oldestAt
      ? Math.floor((input.now.getTime() - Date.parse(input.openSupport.oldestAt)) / DAY_MS)
      : null
    items.push({
      id: 'support',
      tone: 'warning',
      title: `${plural(input.openSupport.count, 'open support request')}`,
      detail: days != null ? `Oldest waiting ${plural(days, 'day')}.` : 'Waiting for a reply.',
      href: '/admin/founder/support',
    })
  }

  if (input.expiringPaidPro > 0) {
    items.push({ id: 'expiring-pro', tone: 'warning', title: `${plural(input.expiringPaidPro, 'paid Pro plan')} ending within ${EXPIRING_SOON_DAYS} days`, detail: 'QR Ph payments do not renew automatically.', href: '/admin/founder/revenue' })
  }

  if (!input.deliveryConfigured) {
    items.push({ id: 'delivery', tone: 'warning', title: 'Marketing delivery not configured', detail: 'RESEND_API_KEY or MARKETING_UNSUBSCRIBE_SECRET is missing on this deployment.', href: '/admin/founder/health' })
  }

  const hasSendable = input.campaigns.some((c) => c.eligible > 0)
  if (input.sendsEnabled && !hasSendable) {
    items.push({ id: 'kill-switch', tone: 'warning', title: 'Campaign sends are enabled with nothing to send', detail: 'Turn MARKETING_CAMPAIGN_SENDS_ENABLED off in Vercel until the next campaign.', href: '/admin/founder/marketing' })
  }

  for (const c of input.campaigns) {
    if (c.delivery.sent === 0 && c.delivery.pending === 0 && c.eligible > 0) {
      items.push({ id: `campaign-ready-${c.id}`, tone: 'info', title: 'Campaign ready', detail: `${c.name}: ${plural(c.eligible, 'eligible recipient')}.`, href: '/admin/founder/marketing' })
    }
  }

  return items
}

// ---------------------------------------------------------------- Recent activity

export type ActivityEvent = { at: string; kind: 'signup' | 'purchase' | 'campaign'; text: string }

export function buildRecentActivity(input: {
  users: FounderUser[]
  purchases: RevenuePurchase[]
  campaigns: { name: string; delivery: CampaignDelivery }[]
  limit?: number
}): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const u of input.users) {
    if (!u.isTester) events.push({ at: u.signedUpAt, kind: 'signup', text: u.name ? `New user · ${u.name.split(' ')[0]}` : 'New user' })
  }
  for (const p of input.purchases) {
    events.push({ at: p.at, kind: 'purchase', text: `Pro ${p.planType} purchase · ₱${p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` })
  }
  for (const c of input.campaigns) {
    if (c.delivery.lastSentAt) events.push({ at: c.delivery.lastSentAt, kind: 'campaign', text: `${c.name} sent · ${c.delivery.sent} accepted` })
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, input.limit ?? 8)
}

// ---------------------------------------------------------------- Health

export type HealthTone = 'ok' | 'warn' | 'bad' | 'unknown'
export type HealthSignal = { label: string; value: string; tone: HealthTone }

export function databaseHealth(check: { ok: boolean; latencyMs: number }): HealthSignal {
  if (!check.ok) return { label: 'Database', value: 'Query failed', tone: 'bad' }
  return { label: 'Database', value: `Responding · ${check.latencyMs} ms`, tone: check.latencyMs > 1500 ? 'warn' : 'ok' }
}

export function authSyncHealth(authWithoutProfile: number | null): HealthSignal {
  if (authWithoutProfile == null) return { label: 'Accounts in sync', value: 'Not available', tone: 'unknown' }
  return authWithoutProfile === 0
    ? { label: 'Accounts in sync', value: 'Every account has a profile', tone: 'ok' }
    : { label: 'Accounts in sync', value: `${plural(authWithoutProfile, 'account')} without a profile`, tone: 'warn' }
}

export function configuredHealth(label: string, configured: boolean, whenMissing = 'Not configured'): HealthSignal {
  return configured ? { label, value: 'Configured', tone: 'ok' } : { label, value: whenMissing, tone: 'bad' }
}
