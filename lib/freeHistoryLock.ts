import { isOlderThanFreeHistory } from '@/lib/freeHistory'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Service-role lookup used only after a Free user's own update matched 0 rows.
 * Matches both the row id and the signed-in user id. A missing row stays not-found.
 */
export async function freeUserOwnsOldRow(
  table: 'expenses' | 'income_records',
  userId: string,
  id: string,
): Promise<boolean> {
  const plan = await resolveUserPlan(userId)
  if (plan.plan_name !== 'free') return false
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('date')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return false
  const date = (data as { date?: string | null }).date
  return typeof date === 'string' && isOlderThanFreeHistory(date)
}
