import { createClient } from '@supabase/supabase-js'

/**
 * Plain Supabase client for browser-only use (e.g. email signup in modals).
 * No SSR helpers, no cookies. Use for auth flows where createBrowserClient may misbehave.
 */
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
