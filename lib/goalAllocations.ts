import type { SupabaseClient } from '@supabase/supabase-js'
import { formatPeso } from '@/lib/format'

/**
 * Edit / remove a single goal allocation (income_allocations row).
 * Goal totals are always derived from allocation rows, so the row itself is the only
 * source of truth; the parent income's disposable_amount is recomputed to stay in sync.
 * The income record's amount, date, and source are never changed.
 */

export const MAX_ALLOCATION_AMOUNT = 1_000_000_000_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AllocationMutationResult =
  | { ok: true; amount: number }
  | { ok: false; status: 400 | 404 | 500; error: string }

const NOT_FOUND: AllocationMutationResult = { ok: false, status: 404, error: 'Allocation not found.' }

export function parseAllocationAmount(raw: unknown): { ok: true; amount: number } | { ok: false; error: string } {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a valid amount.' }
  const amount = Math.round(value * 100) / 100
  if (!(amount > 0)) return { ok: false, error: 'Enter an amount greater than zero.' }
  if (amount > MAX_ALLOCATION_AMOUNT) return { ok: false, error: 'Amount is too large.' }
  return { ok: true, amount }
}

type OwnedAllocation = {
  id: string
  amount: number
  incomeId: string
  incomeTotal: number
  /** Sum of the income's other allocations (excluding this one). */
  otherAllocated: number
}

async function loadOwnedAllocation(
  supabase: SupabaseClient,
  userId: string,
  allocationId: string
): Promise<OwnedAllocation | null> {
  if (!UUID_RE.test(allocationId)) return null

  const { data: allocation } = await supabase
    .from('income_allocations')
    .select('id, amount, income_record_id')
    .eq('id', allocationId)
    .maybeSingle()
  if (!allocation) return null

  const incomeId = (allocation as { income_record_id: string }).income_record_id
  const { data: income } = await supabase
    .from('income_records')
    .select('id, total_amount')
    .eq('id', incomeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!income) return null

  const { data: siblings } = await supabase
    .from('income_allocations')
    .select('id, amount')
    .eq('income_record_id', incomeId)
  const otherAllocated = ((siblings ?? []) as { id: string; amount: number }[])
    .filter((row) => row.id !== allocationId)
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  return {
    id: allocationId,
    amount: Number((allocation as { amount: number }).amount) || 0,
    incomeId,
    incomeTotal: Number((income as { total_amount: number }).total_amount) || 0,
    otherAllocated,
  }
}

async function syncDisposable(supabase: SupabaseClient, userId: string, owned: OwnedAllocation, allocated: number) {
  await supabase
    .from('income_records')
    .update({ disposable_amount: Math.max(0, owned.incomeTotal - allocated) })
    .eq('id', owned.incomeId)
    .eq('user_id', userId)
}

export async function updateGoalAllocation(
  supabase: SupabaseClient,
  userId: string,
  allocationId: string,
  rawAmount: unknown
): Promise<AllocationMutationResult> {
  const parsed = parseAllocationAmount(rawAmount)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }

  const owned = await loadOwnedAllocation(supabase, userId, allocationId)
  if (!owned) return NOT_FOUND

  const available = owned.incomeTotal - owned.otherAllocated
  if (parsed.amount > available + 1e-9) {
    return {
      ok: false,
      status: 400,
      error: `Amount cannot exceed ${formatPeso(Math.max(0, available))} available on this income.`,
    }
  }

  const { data: updated, error } = await supabase
    .from('income_allocations')
    .update({ amount: parsed.amount })
    .eq('id', owned.id)
    .select('id')
  if (error) return { ok: false, status: 500, error: 'Could not update allocation.' }
  if (!updated || updated.length === 0) return NOT_FOUND

  await syncDisposable(supabase, userId, owned, owned.otherAllocated + parsed.amount)
  return { ok: true, amount: parsed.amount }
}

export async function removeGoalAllocation(
  supabase: SupabaseClient,
  userId: string,
  allocationId: string
): Promise<AllocationMutationResult> {
  const owned = await loadOwnedAllocation(supabase, userId, allocationId)
  if (!owned) return NOT_FOUND

  const { data: removed, error } = await supabase
    .from('income_allocations')
    .delete()
    .eq('id', owned.id)
    .select('id')
  if (error) return { ok: false, status: 500, error: 'Could not remove allocation.' }
  if (!removed || removed.length === 0) return NOT_FOUND

  await syncDisposable(supabase, userId, owned, owned.otherAllocated)
  return { ok: true, amount: owned.amount }
}
