import { createClient } from '@supabase/supabase-js'

/**
 * Plain Supabase client for browser-only use (e.g. email signup in modals).
 * No SSR helpers, no cookies. Use for auth flows where createBrowserClient may misbehave.
 * Its own storage key keeps it off the main client's `lock:sb-<ref>-auth-token` Navigator lock;
 * it never holds a session, so nothing is persisted or refreshed.
 */
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storageKey: 'sb-klaroph-signup',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)
