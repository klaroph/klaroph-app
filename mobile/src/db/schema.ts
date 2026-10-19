import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Local mirror of the synced Supabase tables.
 * `dirty` and `base_updated_at` are device-only. The server owns `updated_at`.
 * Amounts are decimal strings so a push round-trips the numeric value.
 */

function syncColumns() {
  return {
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
    baseUpdatedAt: text('base_updated_at'),
    /** Device-only. Bumps on local writes so an in-flight push cannot clear a newer edit. */
    revision: integer('revision').notNull().default(0),
  }
}

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    category: text('category').notNull(),
    type: text('type').notNull(),
    amount: text('amount').notNull(),
    date: text('date').notNull(),
    description: text('description'),
    ...syncColumns(),
  },
  (table) => [
    index('idx_expenses_user_updated_at').on(table.userId, table.updatedAt),
  ],
)

export const incomeRecords = sqliteTable(
  'income_records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    totalAmount: text('total_amount').notNull(),
    disposableAmount: text('disposable_amount').notNull(),
    date: text('date').notNull(),
    incomeSource: text('income_source'),
    ...syncColumns(),
  },
  (table) => [
    index('idx_income_records_user_updated_at').on(table.userId, table.updatedAt),
  ],
)

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    name: text('name').notNull(),
    targetAmount: text('target_amount').notNull(),
    /** Server column. Product writes never set this; sync may copy the server value. */
    savedAmount: text('saved_amount').notNull().default('0.00'),
    pinnedAt: text('pinned_at'),
    ...syncColumns(),
  },
  (table) => [index('idx_goals_user_updated_at').on(table.userId, table.updatedAt)],
)

export const incomeAllocations = sqliteTable(
  'income_allocations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    incomeRecordId: text('income_record_id').references(() => incomeRecords.id),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id),
    amount: text('amount').notNull(),
    ...syncColumns(),
  },
  (table) => [
    index('idx_income_allocations_user_updated_at').on(table.userId, table.updatedAt),
    index('idx_income_allocations_goal_id').on(table.goalId),
    index('idx_income_allocations_income_record_id').on(table.incomeRecordId),
  ],
)

export const budgetPlans = sqliteTable(
  'budget_plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    category: text('category').notNull(),
    amount: text('amount').notNull(),
    note: text('note'),
    ...syncColumns(),
  },
  (table) => [
    index('idx_budget_plans_user_updated_at').on(table.userId, table.updatedAt),
    uniqueIndex('budget_plans_user_category_live')
      .on(table.userId, table.category)
      .where(sql`${table.deletedAt} is null and ${table.userId} is not null`),
    uniqueIndex('budget_plans_local_category_live')
      .on(table.category)
      .where(sql`${table.deletedAt} is null and ${table.userId} is null`),
  ],
)

export const budgetOverrides = sqliteTable(
  'budget_overrides',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    category: text('category').notNull(),
    amount: text('amount').notNull(),
    month: text('month').notNull(),
    note: text('note'),
    ...syncColumns(),
  },
  (table) => [
    index('idx_budget_overrides_user_updated_at').on(table.userId, table.updatedAt),
    uniqueIndex('budget_overrides_user_category_month_live')
      .on(table.userId, table.category, table.month)
      .where(sql`${table.deletedAt} is null and ${table.userId} is not null`),
    uniqueIndex('budget_overrides_local_category_month_live')
      .on(table.category, table.month)
      .where(sql`${table.deletedAt} is null and ${table.userId} is null`),
  ],
)

export const financialAccounts = sqliteTable(
  'financial_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    type: text('type').notNull(),
    subtype: text('subtype').notNull(),
    institutionName: text('institution_name'),
    customName: text('custom_name'),
    amount: text('amount').notNull(),
    notes: text('notes'),
    ...syncColumns(),
  },
  (table) => [
    index('idx_financial_accounts_user_updated_at').on(table.userId, table.updatedAt),
  ],
)

export const syncCursors = sqliteTable(
  'sync_cursors',
  {
    userId: text('user_id').notNull(),
    tableName: text('table_name').notNull(),
    cursorUpdatedAt: text('cursor_updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tableName] })],
)

export const localMeta = sqliteTable('local_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const schema = {
  expenses,
  incomeRecords,
  goals,
  incomeAllocations,
  budgetPlans,
  budgetOverrides,
  financialAccounts,
  syncCursors,
  localMeta,
}
