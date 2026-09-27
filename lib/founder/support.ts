/**
 * Founder Support Inbox. Pure list helpers plus the reply and status workflows, which receive
 * their storage and mailer as arguments so every rule is testable without Supabase or Resend.
 * Inputs are typed `unknown`: they arrive from the browser and are validated here.
 */

import { getFirstName } from '@/lib/email/campaignTemplate'
import { isValidMarketingEmail } from '@/lib/email/marketingAudience'
import type { SendResult, TransactionalMessage } from '@/lib/email/resend'
import { renderSupportReplyEmail } from '@/lib/email/supportReplyTemplate'
import { formatDate } from '@/lib/founder/format'
import { displayName } from '@/lib/founder/metrics'

export const SUPPORT_REPLY_MAX = 5000
/** A reply still 'pending' after this long was interrupted mid-send and may be retried. */
export const SUPPORT_PENDING_STALE_MS = 2 * 60 * 1000
const TITLE_MAX = 80
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SUPPORT_FILTERS = ['open', 'resolved', 'all'] as const
export type SupportFilter = (typeof SUPPORT_FILTERS)[number]
export type SupportStatus = 'open' | 'resolved'

export type SupportRequestRow = {
  id: string
  user_id: string | null
  email: string | null
  subject: string | null
  message: string
  status: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

/** 'sent' = Resend accepted the email; 'pending' = claimed but delivery not yet confirmed. */
export type ReplyDelivery = 'sent' | 'pending'

export type SupportReplyRow = { id: string; support_request_id: string; body: string; created_at: string; delivery_status: ReplyDelivery }

export type SupportRequesterProfile = { id: string; full_name: string | null; nickname: string | null; user_type: string }

export type SupportThread = {
  id: string
  name: string | null
  email: string | null
  isTester: boolean
  title: string
  message: string
  status: SupportStatus
  createdAt: string
  lastActivityAt: string
  replies: { id: string; body: string; createdAt: string; delivery: ReplyDelivery }[]
  awaitingReply: boolean
  hasUnconfirmedReply: boolean
}

export function isStalePending(attemptedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(attemptedAt) >= SUPPORT_PENDING_STALE_MS
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function isSupportFilter(value: unknown): value is SupportFilter {
  return typeof value === 'string' && (SUPPORT_FILTERS as readonly string[]).includes(value)
}

export function supportStatus(status: string | null): SupportStatus {
  return status === 'resolved' ? 'resolved' : 'open'
}

function titleFor(subject: string | null, message: string): string {
  const source = subject?.trim() || message.trim().split('\n')[0]
  return source.length > TITLE_MAX ? `${source.slice(0, TITLE_MAX)}…` : source
}

export function buildSupportThreads(input: {
  requests: SupportRequestRow[]
  replies: SupportReplyRow[]
  profiles: SupportRequesterProfile[]
}): SupportThread[] {
  const profiles = new Map(input.profiles.map((p) => [p.id, p]))
  const repliesByRequest = new Map<string, SupportThread['replies']>()
  for (const r of [...input.replies].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const list = repliesByRequest.get(r.support_request_id) ?? []
    list.push({ id: r.id, body: r.body, createdAt: r.created_at, delivery: r.delivery_status })
    repliesByRequest.set(r.support_request_id, list)
  }

  return input.requests.map((r) => {
    const profile = r.user_id ? profiles.get(r.user_id) : undefined
    const replies = repliesByRequest.get(r.id) ?? []
    const status = supportStatus(r.status)
    return {
      id: r.id,
      name: profile ? displayName(profile) : null,
      email: r.email,
      isTester: profile ? profile.user_type !== 'user' : false,
      title: titleFor(r.subject, r.message),
      message: r.message,
      status,
      createdAt: r.created_at,
      lastActivityAt: r.updated_at,
      replies,
      awaitingReply: status === 'open' && !replies.some((reply) => reply.delivery === 'sent'),
      hasUnconfirmedReply: replies.some((reply) => reply.delivery === 'pending'),
    }
  })
}

/** Unanswered open requests (oldest first), then answered open requests, then resolved — each by latest activity. */
export function sortSupportThreads(threads: SupportThread[]): SupportThread[] {
  const rank = (t: SupportThread) => (t.status === 'resolved' ? 2 : t.awaitingReply ? 0 : 1)
  return [...threads].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    if (rank(a) === 0) return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)
  })
}

export function filterSupportThreads(threads: SupportThread[], filter: SupportFilter, query: string): SupportThread[] {
  const q = query.trim().toLowerCase()
  return threads.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false
    if (!q) return true
    return [t.name, t.email, t.title, t.message].some((field) => field?.toLowerCase().includes(q))
  })
}

export function validateReplyBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (!body) return { ok: false, error: 'Write a reply before sending.' }
  if (body.length > SUPPORT_REPLY_MAX) return { ok: false, error: `Replies can be at most ${SUPPORT_REPLY_MAX} characters.` }
  return { ok: true, body }
}

// ---------- Workflows ----------

export type SupportRequestRecord = SupportRequestRow & {
  requester: { nickname: string | null; full_name: string | null } | null
  accountEmail: string | null
}

type RequestPatch = {
  status: SupportStatus
  resolved_at: string | null
  resolved_by: string | null
  updated_at: string
}

export type SupportStore = {
  getRequest(id: string): Promise<SupportRequestRecord | null>
  /** Inserts a 'pending' founder reply; 'exists' when the id was already used. */
  claimReply(reply: { id: string; support_request_id: string; sender_user_id: string; body: string }): Promise<'claimed' | 'exists'>
  getReply(id: string): Promise<{ support_request_id: string; body: string; delivery_status: string; created_at: string } | null>
  /** Marks a reply 'failed' only if it is still 'pending' and was last attempted before `staleBefore`. */
  releaseStaleReply(id: string, staleBefore: string): Promise<void>
  /** Moves a 'failed' reply back to 'pending' and stamps the new attempt time; false if it is not 'failed'. */
  retryFailedReply(id: string, attemptedAt: string): Promise<boolean>
  finishReply(id: string, patch: { delivery_status: 'sent'; email_message_id: string } | { delivery_status: 'failed' }): Promise<void>
  updateRequest(id: string, patch: RequestPatch): Promise<void>
}

export type SupportMailer = (message: TransactionalMessage, idempotencyKey: string) => Promise<SendResult>

export type SupportActionResult = { ok: boolean; message: string }

const NOT_FOUND: SupportActionResult = { ok: false, message: 'Support request not found.' }

function statusPatch(status: SupportStatus, founderId: string, now: Date): RequestPatch {
  const at = now.toISOString()
  return status === 'resolved'
    ? { status, resolved_at: at, resolved_by: founderId, updated_at: at }
    : { status, resolved_at: null, resolved_by: null, updated_at: at }
}

/** The recipient always comes from the stored request (or its account) — never from the browser. */
function recipientFor(request: SupportRequestRecord): string | null {
  for (const candidate of [request.email, request.accountEmail]) {
    const email = candidate?.trim().toLowerCase()
    if (isValidMarketingEmail(email)) return email
  }
  return null
}

/**
 * Claim → send → record. The reply id is the idempotency key for both the database row and
 * Resend, so a retried submission never emails twice. After a successful send the request is
 * resolved when `resolveAfter` is set, and open otherwise (a reply reopens a resolved request).
 *
 * A reply left 'pending' by an interrupted send becomes retryable once stale: the retry reuses
 * the same id and body, so Resend returns the original email instead of sending a second one.
 */
export async function sendSupportReply(
  deps: { store: SupportStore; mail: SupportMailer; now: Date },
  input: { requestId: unknown; replyId: unknown; body: unknown; resolveAfter: unknown; founderId: string }
): Promise<SupportActionResult> {
  if (!isUuid(input.requestId)) return NOT_FOUND
  if (!isUuid(input.replyId)) return { ok: false, message: 'Invalid reply. Refresh and try again.' }
  const validated = validateReplyBody(input.body)
  if (!validated.ok) return { ok: false, message: validated.error }

  const { store } = deps
  const request = await store.getRequest(input.requestId)
  if (!request) return NOT_FOUND
  const to = recipientFor(request)
  if (!to) return { ok: false, message: 'This request has no valid email address to reply to.' }

  const claim = await store.claimReply({
    id: input.replyId,
    support_request_id: request.id,
    sender_user_id: input.founderId,
    body: validated.body,
  })
  if (claim === 'exists') {
    const existing = await store.getReply(input.replyId)
    if (!existing || existing.support_request_id !== request.id || existing.body !== validated.body) {
      return { ok: false, message: 'Invalid reply. Refresh and try again.' }
    }
    if (existing.delivery_status === 'sent') return { ok: true, message: 'This reply was already sent.' }
    if (existing.delivery_status === 'pending' && isStalePending(existing.created_at, deps.now)) {
      await store.releaseStaleReply(input.replyId, new Date(deps.now.getTime() - SUPPORT_PENDING_STALE_MS).toISOString())
    }
    if (!(await store.retryFailedReply(input.replyId, deps.now.toISOString()))) {
      return { ok: false, message: 'This reply is already being sent. If it stays unconfirmed, retry it in a couple of minutes.' }
    }
  }

  const email = renderSupportReplyEmail({
    firstName: request.requester ? getFirstName(request.requester.nickname, request.requester.full_name) : null,
    reply: validated.body,
    originalSubject: request.subject,
    originalMessage: request.message,
    submittedOn: formatDate(request.created_at),
  })
  const sent = await deps.mail({ to, ...email }, `support-reply-${input.replyId}`)

  if (!sent.ok) {
    console.error(`[support ${request.id}] reply email failed: ${sent.error}`)
    await store.finishReply(input.replyId, { delivery_status: 'failed' })
    return { ok: false, message: 'The email could not be sent, so the reply was not recorded. Your draft is kept — try again.' }
  }

  const resolve = input.resolveAfter === true
  try {
    await store.finishReply(input.replyId, { delivery_status: 'sent', email_message_id: sent.id })
    await store.updateRequest(request.id, statusPatch(resolve ? 'resolved' : 'open', input.founderId, deps.now))
  } catch (e) {
    console.error(`[support ${request.id}] reply sent but not recorded: ${e instanceof Error ? e.message : 'unknown error'}`)
    return { ok: false, message: 'The email was sent, but saving it failed. Refresh before replying again.' }
  }
  return { ok: true, message: resolve ? 'Reply sent and request resolved.' : 'Reply sent.' }
}

export async function setSupportStatus(
  deps: { store: SupportStore; now: Date },
  input: { requestId: unknown; status: unknown; founderId: string }
): Promise<SupportActionResult> {
  if (input.status !== 'open' && input.status !== 'resolved') return { ok: false, message: 'Invalid status.' }
  if (!isUuid(input.requestId)) return NOT_FOUND
  const request = await deps.store.getRequest(input.requestId)
  if (!request) return NOT_FOUND
  if (supportStatus(request.status) === input.status) {
    return { ok: true, message: input.status === 'resolved' ? 'Already resolved.' : 'Already open.' }
  }
  await deps.store.updateRequest(request.id, statusPatch(input.status, input.founderId, deps.now))
  return { ok: true, message: input.status === 'resolved' ? 'Request resolved.' : 'Request reopened.' }
}
