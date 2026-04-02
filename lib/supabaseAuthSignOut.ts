import { clearAuthSessionScope } from '@/lib/authSessionScope'
import { supabase } from '@/lib/supabaseClient'

/** Ends Supabase session and clears client auth scope / sb-* storage keys. */
export async function signOutWithFullCleanup(): Promise<void> {
  clearAuthSessionScope()
  await supabase.auth.signOut()
}
