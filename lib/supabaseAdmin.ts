import { createClient } from '@supabase/supabase-js'

/**
 * Supabase admin client using service_role key.
 * Use ONLY in server-side code (API routes, webhooks).
 * This client bypasses RLS — never expose to the browser.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
