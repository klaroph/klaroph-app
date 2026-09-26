import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { isFounderUser } from '@/lib/founderDashboardAuth'

/** Verified founder check for server actions and route handlers (getUser validates with Supabase). */
export async function getFounderUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isFounderUser(user, process.env.FOUNDER_EMAIL)) return null
  return { id: user.id, email: user.email! }
}

/** Page guard: signed-out visitors go home, signed-in non-founders go to their dashboard. */
export async function requireFounder(): Promise<{ id: string; email: string }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')
  if (!isFounderUser(user, process.env.FOUNDER_EMAIL)) redirect('/dashboard')
  return { id: user.id, email: user.email! }
}
