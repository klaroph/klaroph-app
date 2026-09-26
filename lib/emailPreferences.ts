/**
 * Product-update email preference, stored only as profiles.marketing_emails_unsubscribed_at
 * (NULL = subscribed). Uses the caller's RLS-scoped client, so a user can only touch their own row.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailPreferences = { productUpdates: boolean }

export type EmailPreferencesResult =
  | { ok: true; preferences: EmailPreferences }
  | { ok: false; status: 404 | 500 | 503; error: string }

export function isSubscribedToProductUpdates(unsubscribedAt: string | null | undefined): boolean {
  return unsubscribedAt == null
}

export function unsubscribedAtFor(productUpdates: boolean, now: Date = new Date()): string | null {
  return productUpdates ? null : now.toISOString()
}

/** Column missing until migration 20260926000000_marketing_email_foundation is applied. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || error.code === 'PGRST204' || /marketing_emails_unsubscribed_at/.test(error.message ?? '')
}

function failure(error: { code?: string; message?: string }): EmailPreferencesResult {
  if (isMissingColumn(error)) return { ok: false, status: 503, error: 'Email preferences are not available yet.' }
  if (error.code === 'PGRST116') return { ok: false, status: 404, error: 'Profile not found.' }
  return { ok: false, status: 500, error: 'Could not load email preferences.' }
}

export async function getEmailPreferences(supabase: SupabaseClient, userId: string): Promise<EmailPreferencesResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('marketing_emails_unsubscribed_at')
    .eq('id', userId)
    .single()
  if (error) return failure(error)
  return { ok: true, preferences: { productUpdates: isSubscribedToProductUpdates(data?.marketing_emails_unsubscribed_at) } }
}

export async function setProductUpdates(
  supabase: SupabaseClient,
  userId: string,
  productUpdates: boolean,
  now: Date = new Date()
): Promise<EmailPreferencesResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ marketing_emails_unsubscribed_at: unsubscribedAtFor(productUpdates, now) })
    .eq('id', userId)
    .select('marketing_emails_unsubscribed_at')
    .single()
  if (error) return failure(error)
  return { ok: true, preferences: { productUpdates: isSubscribedToProductUpdates(data?.marketing_emails_unsubscribed_at) } }
}
