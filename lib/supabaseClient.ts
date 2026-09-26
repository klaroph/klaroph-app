import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (process.env.NODE_ENV !== 'production') {
  console.log('SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error(
    'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
}

export const supabase = createBrowserClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

let inFlightUser: ReturnType<typeof supabase.auth.getUser> | null = null

/**
 * Server-validated current user (auth.getUser). Concurrent callers share one request:
 * getUser holds the cross-tab auth lock for its network round trip, so a burst of
 * independent calls on page load would otherwise queue and starve other lock waiters.
 */
export function getBrowserUser(): ReturnType<typeof supabase.auth.getUser> {
  inFlightUser ??= supabase.auth.getUser().finally(() => {
    inFlightUser = null
  })
  return inFlightUser
}
