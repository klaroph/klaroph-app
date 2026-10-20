import type { SupabaseClient } from '@supabase/supabase-js'

export type PasswordSession = {
  userId: string
  tokenKey: string
  tokenValue: string
  accessToken: string
  refreshToken: string
}

/** Default supabase-js storage key for a project URL. */
export function supabaseAuthStorageKey(url: string): string {
  const host = new URL(url).hostname.split('.')[0]
  return `sb-${host}-auth-token`
}

export async function supabasePasswordSignIn(
  client: SupabaseClient,
  url: string,
  email: string,
  password: string,
): Promise<PasswordSession> {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.session) throw new Error(error?.message ?? 'Sign-in failed.')
  const session = data.session
  return {
    userId: session.user.id,
    tokenKey: supabaseAuthStorageKey(url),
    tokenValue: JSON.stringify(session),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  }
}

export async function restoreSupabaseSession(
  client: SupabaseClient,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) throw new Error(error.message)
}
