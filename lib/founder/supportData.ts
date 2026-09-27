/**
 * Server-only Supabase access for the Founder Support Inbox (service role).
 * Reads support tables and requester name/type only — no finances, no Ask Klaro content.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  buildSupportThreads,
  type SupportReplyRow,
  type SupportRequestRow,
  type SupportRequesterProfile,
  type SupportStore,
  type SupportThread,
} from '@/lib/founder/support'

const REQUEST_FIELDS = 'id, user_id, email, subject, message, status, created_at, updated_at, resolved_at'
const UNIQUE_VIOLATION = '23505'

export async function loadSupportThreads(): Promise<SupportThread[]> {
  const [requests, replies] = await Promise.all([
    supabaseAdmin.from('support_requests').select(REQUEST_FIELDS).order('created_at'),
    supabaseAdmin
      .from('support_request_messages')
      .select('id, support_request_id, body, created_at, delivery_status')
      .eq('sender_type', 'founder')
      .in('delivery_status', ['sent', 'pending']),
  ])
  if (requests.error) throw new Error(`support_requests: ${requests.error.message}`)
  if (replies.error) throw new Error(`support_request_messages: ${replies.error.message}`)

  const rows = (requests.data ?? []) as SupportRequestRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)))]
  let profiles: SupportRequesterProfile[] = []
  if (userIds.length > 0) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name, nickname, user_type').in('id', userIds)
    if (error) throw new Error(`profiles: ${error.message}`)
    profiles = (data ?? []) as SupportRequesterProfile[]
  }

  return buildSupportThreads({ requests: rows, replies: (replies.data ?? []) as SupportReplyRow[], profiles })
}

export const supabaseSupportStore: SupportStore = {
  async getRequest(id) {
    const { data, error } = await supabaseAdmin.from('support_requests').select(REQUEST_FIELDS).eq('id', id).maybeSingle()
    if (error) throw new Error(`support_requests: ${error.message}`)
    if (!data) return null
    const row = data as SupportRequestRow
    if (!row.user_id) return { ...row, requester: null, accountEmail: null }

    const [profile, account] = await Promise.all([
      supabaseAdmin.from('profiles').select('nickname, full_name').eq('id', row.user_id).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(row.user_id),
    ])
    return {
      ...row,
      requester: (profile.data as { nickname: string | null; full_name: string | null } | null) ?? null,
      accountEmail: account.data.user?.email ?? null,
    }
  },

  async claimReply(reply) {
    const { error } = await supabaseAdmin
      .from('support_request_messages')
      .insert({ ...reply, sender_type: 'founder', delivery_status: 'pending' })
    if (!error) return 'claimed'
    if (error.code === UNIQUE_VIOLATION) return 'exists'
    throw new Error(`support_request_messages: ${error.message}`)
  },

  async getReply(id) {
    const { data, error } = await supabaseAdmin
      .from('support_request_messages')
      .select('support_request_id, body, delivery_status, created_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`support_request_messages: ${error.message}`)
    return data as { support_request_id: string; body: string; delivery_status: string; created_at: string } | null
  },

  async releaseStaleReply(id, staleBefore) {
    const { error } = await supabaseAdmin
      .from('support_request_messages')
      .update({ delivery_status: 'failed' })
      .eq('id', id)
      .eq('delivery_status', 'pending')
      .lt('created_at', staleBefore)
    if (error) throw new Error(`support_request_messages: ${error.message}`)
  },

  async retryFailedReply(id, attemptedAt) {
    const { data, error } = await supabaseAdmin
      .from('support_request_messages')
      .update({ delivery_status: 'pending', created_at: attemptedAt })
      .eq('id', id)
      .eq('delivery_status', 'failed')
      .select('id')
    if (error) throw new Error(`support_request_messages: ${error.message}`)
    return (data ?? []).length === 1
  },

  async finishReply(id, patch) {
    const { error } = await supabaseAdmin.from('support_request_messages').update(patch).eq('id', id)
    if (error) throw new Error(`support_request_messages: ${error.message}`)
  },

  async updateRequest(id, patch) {
    const { error } = await supabaseAdmin.from('support_requests').update(patch).eq('id', id)
    if (error) throw new Error(`support_requests: ${error.message}`)
  },
}
