import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8')
}

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GOAL_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const GOAL_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const INCOME_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ALLOC_A = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const ALLOC_ORPHAN = '11111111-1111-4111-8111-111111111111'

const SETUP = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  last_sign_in_at timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_type text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  streak_days int NOT NULL DEFAULT 0
);
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  max_goals int
);
CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY,
  status text,
  plan_id uuid,
  current_period_end timestamptz,
  grace_period_until timestamptz,
  is_lifetime boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION public.get_profile_completion_percentage(p_user_id uuid)
RETURNS int LANGUAGE sql STABLE AS $$ SELECT 0 $$;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text,
  type text,
  amount numeric,
  date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.income_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  total_amount numeric,
  disposable_amount numeric,
  date date,
  income_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_amount numeric NOT NULL,
  saved_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.income_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_record_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  amount numeric NOT NULL
);
CREATE TABLE public.budget_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  month date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.budget_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  subtype text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`

async function applyMigrations(db: PGlite): Promise<void> {
  await db.exec(readMigration('20261019100000_sync_updated_at_deleted_at.sql'))
  await db.exec(readMigration('20261019110000_income_allocations_user_id.sql'))
  await db.exec(readMigration('20261019120000_exclude_soft_deleted_reads.sql'))
}

describe('sync schema migrations', () => {
  it('sets updated_at on the server, keeps a tombstone, backfills user_id, and skips deleted goals', async () => {
    const db = new PGlite()
    await db.exec(SETUP)
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('${USER_A}'), ('${USER_B}');
      INSERT INTO public.profiles (id, user_type) VALUES ('${USER_A}', 'user');
      INSERT INTO public.goals (id, user_id, name, target_amount, saved_amount)
        VALUES ('${GOAL_A}', '${USER_A}', 'Emergency', 1000, 0);
      INSERT INTO public.income_records (id, user_id, total_amount, disposable_amount, date)
        VALUES ('${INCOME_A}', '${USER_A}', 500, 500, '2026-10-01');
      INSERT INTO public.income_allocations (id, income_record_id, goal_id, amount)
        VALUES ('${ALLOC_A}', '${INCOME_A}', '${GOAL_A}', 100);
      INSERT INTO public.income_allocations (id, income_record_id, goal_id, amount)
        VALUES ('${ALLOC_ORPHAN}', '${USER_B}', '${GOAL_A}', 25);
    `)

    await applyMigrations(db)

    const alloc = await db.query<{ user_id: string; income_record_id: string | null }>(
      `SELECT user_id::text, income_record_id::text FROM public.income_allocations WHERE id = '${ALLOC_A}'`
    )
    expect(alloc.rows[0]?.user_id).toBe(USER_A)

    const orphan = await db.query<{ user_id: string }>(
      `SELECT user_id::text FROM public.income_allocations WHERE id = '${ALLOC_ORPHAN}'`
    )
    expect(orphan.rows[0]?.user_id).toBe(USER_A)

    await db.exec(`
      INSERT INTO public.expenses (id, user_id, amount, date, updated_at)
      VALUES ('${GOAL_B}', '${USER_A}', 10, '2026-10-01', '1999-01-01');
    `)
    const stamped = await db.query<{ updated_at: string }>(
      `SELECT updated_at::text FROM public.expenses WHERE id = '${GOAL_B}'`
    )
    expect(new Date(stamped.rows[0]!.updated_at).getUTCFullYear()).toBeGreaterThan(1999)

    await db.exec(`UPDATE public.expenses SET deleted_at = now() WHERE id = '${GOAL_B}'`)
    await db.exec(`UPDATE public.expenses SET deleted_at = NULL, amount = 99 WHERE id = '${GOAL_B}'`)
    const tombstone = await db.query<{ deleted_at: string | null; amount: string }>(
      `SELECT deleted_at::text, amount::text FROM public.expenses WHERE id = '${GOAL_B}'`
    )
    expect(tombstone.rows[0]?.deleted_at).not.toBeNull()
    expect(Number(tombstone.rows[0]?.amount)).toBe(99)

    await db.exec(`
      INSERT INTO public.income_allocations (goal_id, amount, user_id)
      VALUES ('${GOAL_A}', 15, '${USER_A}');
    `)
    await expect(
      db.exec(`
        INSERT INTO public.goals (id, user_id, name, target_amount)
          VALUES ('${GOAL_B}', '${USER_B}', 'Other', 50);
        INSERT INTO public.income_allocations (income_record_id, goal_id, amount, user_id)
          VALUES ('${INCOME_A}', '${GOAL_B}', 5, '${USER_A}');
      `)
    ).rejects.toThrow(/Invalid goal/)

    const policies = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'income_allocations' ORDER BY policyname`
    )
    expect(policies.rows.map((row) => row.policyname)).toEqual([
      'income_allocations_delete_own',
      'income_allocations_insert_own',
      'income_allocations_select_own',
      'income_allocations_update_own',
    ])

    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%_user_updated_at' ORDER BY indexname`
    )
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'idx_budget_overrides_user_updated_at',
      'idx_budget_plans_user_updated_at',
      'idx_expenses_user_updated_at',
      'idx_financial_accounts_user_updated_at',
      'idx_goals_user_updated_at',
      'idx_income_allocations_user_updated_at',
      'idx_income_records_user_updated_at',
    ])

    await db.exec(`
      DROP TRIGGER IF EXISTS goals_enforce_plan_limit ON public.goals;
      CREATE TRIGGER goals_enforce_plan_limit
        BEFORE INSERT ON public.goals
        FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_plan_limit();
      INSERT INTO public.goals (user_id, name, target_amount) VALUES ('${USER_A}', 'One', 1);
    `)
    await expect(
      db.exec(`INSERT INTO public.goals (user_id, name, target_amount) VALUES ('${USER_A}', 'Two', 1)`)
    ).rejects.toThrow(/GOAL_LIMIT_REACHED/)

    await db.exec(`
      UPDATE public.goals SET deleted_at = now()
      WHERE user_id = '${USER_A}' AND name = 'One';
    `)
    await db.exec(`INSERT INTO public.goals (user_id, name, target_amount) VALUES ('${USER_A}', 'Replacement', 1)`)

    const clarity = await db.query<{ get_clarity_level: number }>(
      `SELECT public.get_clarity_level('${USER_A}') AS get_clarity_level`
    )
    expect(clarity.rows[0]?.get_clarity_level).toBeGreaterThanOrEqual(2)

    await db.exec(`
      UPDATE public.income_allocations
      SET deleted_at = now() - interval '91 days'
      WHERE id = '${ALLOC_A}';
      UPDATE public.goals
      SET deleted_at = now() - interval '91 days'
      WHERE id = '${GOAL_A}';
      INSERT INTO public.income_allocations (id, goal_id, amount, user_id, deleted_at)
      VALUES ('22222222-2222-4222-8222-222222222222', '${GOAL_A}', 1, '${USER_A}', now() - interval '1 day');
    `)
    const purged = await db.query<{ purge_soft_deleted_synced_rows: { income_allocations: number; goals: number } }>(
      `SELECT public.purge_soft_deleted_synced_rows() AS purge_soft_deleted_synced_rows`
    )
    expect(Number(purged.rows[0]?.purge_soft_deleted_synced_rows.income_allocations)).toBe(1)
    expect(Number(purged.rows[0]?.purge_soft_deleted_synced_rows.goals)).toBe(0)
    const remaining = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.income_allocations WHERE id = '${ALLOC_A}'`
    )
    expect(remaining.rows[0]?.n).toBe('0')
    const keptGoal = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.goals WHERE id = '${GOAL_A}'`
    )
    expect(keptGoal.rows[0]?.n).toBe('1')

    const metrics = await db.query<{ get_founder_metrics: { total_expenses: number } }>(
      `SELECT public.get_founder_metrics() AS get_founder_metrics`
    )
    expect(metrics.rows[0]?.get_founder_metrics.total_expenses).toBe(0)

    await applyMigrations(db)
  })

  it('aborts when an allocation owner would not match the goal', async () => {
    const db = new PGlite()
    await db.exec(SETUP)
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('${USER_A}'), ('${USER_B}');
      INSERT INTO public.goals (id, user_id, name, target_amount)
        VALUES ('${GOAL_B}', '${USER_B}', 'Theirs', 10);
      INSERT INTO public.income_records (id, user_id, total_amount, date)
        VALUES ('${INCOME_A}', '${USER_A}', 20, '2026-10-01');
      INSERT INTO public.income_allocations (income_record_id, goal_id, amount)
        VALUES ('${INCOME_A}', '${GOAL_B}', 5);
    `)
    await db.exec(readMigration('20261019100000_sync_updated_at_deleted_at.sql'))
    await expect(db.exec(readMigration('20261019110000_income_allocations_user_id.sql'))).rejects.toThrow(
      /does not match the goal owner/
    )
  })
})
