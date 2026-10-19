import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { keysetOr, type PullPageInput } from './cursor'
import { DomainError } from '../domain/errors'
import type { ServerStamp, SyncedTable } from './model'
import { fieldsFor } from './model'
import type { RemoteSync } from './remote'
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

type UpsertQuery = {
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      single: () => Promise<{ data: ServerStamp | null; error: QueryError }>
    }
  }
}

export type SyncSupabase = {
  from: (table: SyncedTable) => FilterQuery & UpsertQuery
}

function remoteError(error: Exclude<QueryError, null>): never {
  throw new DomainError(error.code ?? 'REMOTE', error.message)
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

/**
 * Push is an upsert on the primary key only. Partial unique indexes
 * (budget category, budget override month) are not conflict targets.
 */
export function createSupabaseRemote(client: SupabaseClient): RemoteSync {
  const db = asSyncClient(client)
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
    async push(table, payload) {
      const { data, error } = await db
        .from(table)
        .upsert(payload, { onConflict: 'id' })
        .select('id, updated_at, deleted_at')
        .single()
      if (error) remoteError(error)
      if (!data) throw new DomainError('REMOTE', 'Upsert returned no row.')
      return data
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
  }
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
