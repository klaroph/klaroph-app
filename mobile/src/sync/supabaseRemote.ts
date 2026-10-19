import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { keysetOr, type PullPageInput } from './cursor'
import { DomainError } from '../domain/errors'
import {
  accountPlanFromSubscription,
  type PlanConfig,
  type SubscriptionSnapshot,
} from '../domain/planLimits'
import type { ServerStamp, SyncedTable } from './model'
import { fieldsFor } from './model'
import type { AccountFeatures, PushMode, RemoteSync } from './remote'
import type { TokenStore } from './tokenStore'

const SELECT_LIST: Record<SyncedTable, string> = {
  expenses: 'id, user_id, category, type, amount, date, description, created_at, updated_at, deleted_at',
  income_records: 'id, user_id, total_amount, disposable_amount, date, income_source, created_at, updated_at, deleted_at',
  goals: 'id, user_id, name, target_amount, saved_amount, pinned_at, created_at, updated_at, deleted_at',
  budget_plans: 'id, user_id, category, amount, note, created_at, updated_at, deleted_at',
  budget_overrides: 'id, user_id, category, amount, month, note, created_at, updated_at, deleted_at',
  financial_accounts: 'id, user_id, type, subtype, institution_name, custom_name, amount, notes, created_at, updated_at, deleted_at',
  income_allocations: 'id, user_id, income_record_id, goal_id, amount, created_at, updated_at, deleted_at',
}

type QueryError = { message: string; code?: string } | null

type FilterQuery = {
  select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => FilterQuery
  eq: (column: string, value: string) => FilterQuery
  gte: (column: string, value: string) => FilterQuery
  or: (filters: string) => FilterQuery
  is: (column: string, value: null) => FilterQuery
  order: (column: string, options: { ascending: boolean }) => FilterQuery
  limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: QueryError }>
  then: PromiseLike<{ data: Record<string, unknown>[] | null; error: QueryError; count: number | null }>['then']
}

type WriteResult = {
  select: (columns: string) => {
    single: () => Promise<{ data: ServerStamp | null; error: QueryError }>
  }
}

type WriteQuery = {
  insert: (values: Record<string, unknown>) => WriteResult
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => WriteResult
  }
}

export type SyncSupabase = {
  from: (table: SyncedTable) => FilterQuery & WriteQuery
}

type AccountQuery = {
  select: (columns: string) => AccountQuery
  eq: (column: string, value: string) => AccountQuery
  order: (column: string, options: { ascending: boolean }) => AccountQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: QueryError }>
  then: PromiseLike<{ data: Record<string, unknown>[] | null; error: QueryError }>['then']
}

type AccountClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; created_at?: string | null } | null }
      error: QueryError
    }>
  }
  from: (table: 'profiles' | 'subscriptions' | 'plans') => AccountQuery
}

function remoteError(error: Exclude<QueryError, null>): never {
  throw new DomainError(error.code ?? 'REMOTE', error.message)
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof DomainError && error.code === '23505'
}

async function writeById(
  db: SyncSupabase,
  table: SyncedTable,
  payload: Record<string, unknown>,
  mode: PushMode,
): Promise<ServerStamp> {
  const id = String(payload.id)
  const writing = mode === 'insert'
    ? db.from(table).insert(payload)
    : db.from(table).update(payload).eq('id', id)
  const { data, error } = await writing.select('id, updated_at, deleted_at').single()
  if (error) remoteError(error)
  if (!data) throw new DomainError('REMOTE', 'Write returned no row.')
  return data
}

export function createKlaroSupabase(url: string, anonKey: string, storage: SupportedStorage): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

export function tokenStoreStorage(tokens: TokenStore): SupportedStorage {
  return {
    getItem: (key) => tokens.get(key),
    setItem: (key, value) => tokens.set(key, value),
    removeItem: (key) => tokens.remove(key),
  }
}

function asSyncClient(client: SupabaseClient): SyncSupabase {
  return client as unknown as SyncSupabase
}

function asAccountClient(client: SupabaseClient): AccountClient {
  return client as unknown as AccountClient
}

/**
 * Never-synced rows are inserted. Rows the server has already acknowledged are
 * updated by id. An upsert would run the goal-limit trigger on its insert half
 * and reject an edit or delete once the account is at the cap.
 * A duplicate primary key on insert is a lost response: update that id instead.
 * Partial unique indexes are not conflict targets.
 */
export function createSupabaseRemote(client: SupabaseClient): RemoteSync {
  const db = asSyncClient(client)
  const account = asAccountClient(client)
  return {
    async pullPage(input: PullPageInput) {
      let query = db.from(input.table).select(selectList(input.table)).eq('user_id', input.userId)
      if (input.updatedAtGte) query = query.gte('updated_at', input.updatedAtGte)
      if (input.after) query = query.or(keysetOr(input.after.updatedAt, input.after.id))
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(input.limit)
      if (error) remoteError(error)
      return data ?? []
    },
    async push(table, payload, mode) {
      if (mode === 'update') return writeById(db, table, payload, 'update')
      try {
        return await writeById(db, table, payload, 'insert')
      } catch (error) {
        if (!isUniqueConflict(error)) throw error
        try {
          return await writeById(db, table, payload, 'update')
        } catch {
          throw error
        }
      }
    },
    async countLive(table, userId) {
      const { count, error } = await db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null)
      if (error) remoteError(error)
      return count ?? 0
    },
    async resolveAccount(userId) {
      return readAccountFeatures(account, userId)
    },
  }
}

const SUBSCRIPTION_COLUMNS = 'status, plan_id, current_period_end, grace_period_until, is_lifetime'
const PLAN_COLUMNS = 'id, name, max_goals, has_budgeting'

/**
 * Reads `subscriptions` for this user with the user token. RLS policy
 * `subscriptions_select_own` is `auth.uid() = user_id`. `plans` is readable by
 * `authenticated`. `get_user_features` is not called.
 * A subscription or plans error is thrown so sync can keep the Free goal cap
 * without storing a budget clock. No subscription row is Free.
 * A profile read failure does not fail the lookup; the simulate flag stays false.
 */
async function readAccountFeatures(account: AccountClient, userId: string): Promise<AccountFeatures> {
  const subscriptionResult = await account
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .order('current_period_end', { ascending: false })
    .maybeSingle()
  if (subscriptionResult.error) remoteError(subscriptionResult.error)

  const plansResult = subscriptionResult.data
    ? await account.from('plans').select(PLAN_COLUMNS)
    : { data: [], error: null }
  if (plansResult.error) remoteError(plansResult.error)

  const resolved = accountPlanFromSubscription(
    subscriptionFromRow(subscriptionResult.data),
    plansFromRows(plansResult.data),
    new Date(),
  )

  const userResult = await account.auth.getUser()
  if (userResult.error) remoteError(userResult.error)
  const user = userResult.data.user
  const accountCreatedAt = user && user.id === userId ? user.created_at ?? null : null
  let simulateBudgetExpired = false
  try {
    const profile = await account
      .from('profiles')
      .select('simulate_budget_expired')
      .eq('id', userId)
      .maybeSingle()
    if (!profile.error && profile.data?.simulate_budget_expired === true) {
      simulateBudgetExpired = true
    }
  } catch {
    simulateBudgetExpired = false
  }
  return {
    plan: resolved.plan,
    fullBudgeting: resolved.fullBudgeting,
    accountCreatedAt,
    simulateBudgetExpired,
  }
}

function subscriptionFromRow(row: Record<string, unknown> | null): SubscriptionSnapshot | null {
  if (!row) return null
  return {
    status: typeof row.status === 'string' ? row.status : null,
    planId: typeof row.plan_id === 'string' ? row.plan_id : null,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    gracePeriodUntil: typeof row.grace_period_until === 'string' ? row.grace_period_until : null,
    isLifetime: row.is_lifetime === true,
  }
}

function plansFromRows(rows: Record<string, unknown>[] | null): PlanConfig[] {
  if (!rows) return []
  const plans: PlanConfig[] = []
  for (const row of rows) {
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue
    const maxGoals = typeof row.max_goals === 'number' && Number.isInteger(row.max_goals) ? row.max_goals : null
    plans.push({
      id: row.id,
      name: row.name,
      maxGoals,
      hasBudgeting: typeof row.has_budgeting === 'boolean' ? row.has_budgeting : null,
    })
  }
  return plans
}

function selectList(table: SyncedTable): string {
  const known = SELECT_LIST[table]
  const expected = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', ...fieldsFor(table).map((field) => field.name)]
  const actual = known.split(',').map((part) => part.trim())
  for (const column of expected) {
    if (!actual.includes(column)) {
      throw new DomainError('SYNC', `Select list for ${table} is missing ${column}.`)
    }
  }
  return known
}
