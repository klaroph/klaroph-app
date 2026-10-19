import { canonicalTimestamp, requireIsoDate } from '../domain/time'
import { DomainError } from '../domain/errors'
import { moneyToText, parseMoney } from '../domain/money'

export const SYNCED_TABLES = [
  'expenses',
  'income_records',
  'goals',
  'budget_plans',
  'budget_overrides',
  'financial_accounts',
  'income_allocations',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

export const PARENT_TABLES = [
  'expenses',
  'income_records',
  'goals',
  'budget_plans',
  'budget_overrides',
  'financial_accounts',
] as const satisfies readonly SyncedTable[]

export type TableCounts = Record<SyncedTable, number>

export function emptyCounts(): TableCounts {
  return {
    expenses: 0,
    income_records: 0,
    goals: 0,
    budget_plans: 0,
    budget_overrides: 0,
    financial_accounts: 0,
    income_allocations: 0,
  }
}

export type SyncRow = {
  table: SyncedTable
  id: string
  user_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  dirty: boolean
  base_updated_at: string | null
  /** Local write counter. Not sent to the server. */
  revision: number
  values: Record<string, string | null>
}

export type ServerRow = {
  table: SyncedTable
  id: string
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  values: Record<string, string | null>
}

export type ServerStamp = {
  id: string
  updated_at: string
  deleted_at: string | null
}

type FieldKind = 'text' | 'money' | 'date'

type Field = {
  name: string
  kind: FieldKind
  nullable: boolean
  /** `saved_amount` is mirrored on pull and never sent. */
  push: boolean
}

const FIELDS: Record<SyncedTable, readonly Field[]> = {
  expenses: [
    { name: 'category', kind: 'text', nullable: false, push: true },
    { name: 'type', kind: 'text', nullable: false, push: true },
    { name: 'amount', kind: 'money', nullable: false, push: true },
    { name: 'date', kind: 'date', nullable: false, push: true },
    { name: 'description', kind: 'text', nullable: true, push: true },
  ],
  income_records: [
    { name: 'total_amount', kind: 'money', nullable: false, push: true },
    { name: 'disposable_amount', kind: 'money', nullable: false, push: true },
    { name: 'date', kind: 'date', nullable: false, push: true },
    { name: 'income_source', kind: 'text', nullable: true, push: true },
  ],
  goals: [
    { name: 'name', kind: 'text', nullable: false, push: true },
    { name: 'target_amount', kind: 'money', nullable: false, push: true },
    { name: 'saved_amount', kind: 'money', nullable: false, push: false },
    { name: 'pinned_at', kind: 'text', nullable: true, push: true },
  ],
  budget_plans: [
    { name: 'category', kind: 'text', nullable: false, push: true },
    { name: 'amount', kind: 'money', nullable: false, push: true },
    { name: 'note', kind: 'text', nullable: true, push: true },
  ],
  budget_overrides: [
    { name: 'category', kind: 'text', nullable: false, push: true },
    { name: 'amount', kind: 'money', nullable: false, push: true },
    { name: 'month', kind: 'date', nullable: false, push: true },
    { name: 'note', kind: 'text', nullable: true, push: true },
  ],
  financial_accounts: [
    { name: 'type', kind: 'text', nullable: false, push: true },
    { name: 'subtype', kind: 'text', nullable: false, push: true },
    { name: 'institution_name', kind: 'text', nullable: true, push: true },
    { name: 'custom_name', kind: 'text', nullable: true, push: true },
    { name: 'amount', kind: 'money', nullable: false, push: true },
    { name: 'notes', kind: 'text', nullable: true, push: true },
  ],
  income_allocations: [
    { name: 'income_record_id', kind: 'text', nullable: true, push: true },
    { name: 'goal_id', kind: 'text', nullable: false, push: true },
    { name: 'amount', kind: 'money', nullable: false, push: true },
  ],
}

export function fieldsFor(table: SyncedTable): readonly Field[] {
  switch (table) {
    case 'expenses':
    case 'income_records':
    case 'goals':
    case 'budget_plans':
    case 'budget_overrides':
    case 'financial_accounts':
    case 'income_allocations':
      return FIELDS[table]
    default: {
      const neverTable: never = table
      return neverTable
    }
  }
}

function requiredString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError('REMOTE_ROW', `Missing ${key}.`)
  }
  return value
}

export function normalizeServerRow(table: SyncedTable, raw: Record<string, unknown>): ServerRow {
  const deletedRaw = raw.deleted_at
  const deletedAt =
    deletedRaw == null || deletedRaw === ''
      ? null
      : canonicalTimestamp(typeof deletedRaw === 'string' ? deletedRaw : String(deletedRaw))
  const values: Record<string, string | null> = {}
  for (const field of fieldsFor(table)) {
    const rawValue = raw[field.name]
    if (rawValue == null || rawValue === '') {
      if (!field.nullable) {
        values[field.name] = field.name === 'saved_amount' ? '0.00' : failMissing(table, field.name)
      } else {
        values[field.name] = null
      }
      continue
    }
    if (field.kind === 'money') {
      values[field.name] = moneyToText(parseMoney(rawValue as string | number, field.name))
    } else if (field.kind === 'date') {
      values[field.name] = requireIsoDate(String(rawValue), field.name)
    } else {
      values[field.name] = String(rawValue)
    }
  }
  return {
    table,
    id: requiredString(raw, 'id'),
    user_id: requiredString(raw, 'user_id'),
    created_at: canonicalTimestamp(requiredString(raw, 'created_at')),
    updated_at: canonicalTimestamp(requiredString(raw, 'updated_at')),
    deleted_at: deletedAt,
    values,
  }
}

function failMissing(table: SyncedTable, field: string): never {
  throw new DomainError('REMOTE_ROW', `Missing ${field} on ${table}.`)
}

/**
 * Columns the server is allowed to see. `updated_at` stays off the payload
 * because the server trigger stamps it. `deleted_at` is included only when
 * this device is tombstoning the row — a null would try to clear it.
 * `saved_amount` is never sent.
 */
export function toPushPayload(row: SyncRow): Record<string, unknown> {
  if (!row.user_id) {
    throw new DomainError('SYNC', 'Cannot push a row with no user.')
  }
  const payload: Record<string, unknown> = {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
  }
  for (const field of fieldsFor(row.table)) {
    if (!field.push) continue
    const raw = row.values[field.name]
    if (raw == null) {
      payload[field.name] = field.nullable ? null : failMissing(row.table, field.name)
      continue
    }
    payload[field.name] = field.kind === 'money' ? parseMoney(raw, field.name) : raw
  }
  if (row.deleted_at) {
    payload.deleted_at = row.deleted_at
  }
  return payload
}
