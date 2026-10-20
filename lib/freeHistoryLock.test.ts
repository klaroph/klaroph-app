import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LIFETIME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EXPIRED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const IN_GRACE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PAST_GRACE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const FREE_GRACE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const LATEST_EXPIRED = '11111111-1111-4111-8111-111111111111'
const LATEST_LIFETIME = '22222222-2222-4222-8222-222222222222'
const PRO_PLAN = '33333333-3333-4333-8333-333333333333'
const FREE_PLAN = '44444444-4444-4444-8444-444444444444'
const PREMIUM_PLAN = '55555555-5555-4555-8555-555555555555'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020140000_free_history_lock.sql'),
  'utf8',
)

async function database(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE TABLE public.plans (
      id uuid PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE public.subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      status text,
      plan_id uuid REFERENCES public.plans (id),
      current_period_end timestamptz,
      grace_period_until timestamptz,
      is_lifetime boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.expenses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      date date,
      amount numeric,
      deleted_at timestamptz
    );
    CREATE TABLE public.income_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      date date,
      total_amount numeric,
      deleted_at timestamptz
    );
    INSERT INTO public.plans (id, name) VALUES
      ('${PRO_PLAN}', 'pro'),
      ('${FREE_PLAN}', 'free'),
      ('${PREMIUM_PLAN}', ' Clarity_Premium ');
  `)
  await db.exec(migration)
  await db.exec(`
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${LIFETIME}', 'active', '${FREE_PLAN}', now(), true);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${EXPIRED}', 'active', '${PRO_PLAN}', now() - interval '1 day', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, grace_period_until, is_lifetime)
      VALUES ('${IN_GRACE}', 'past_due', '${PRO_PLAN}', now() - interval '2 days', now() + interval '3 days', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, grace_period_until, is_lifetime)
      VALUES ('${PAST_GRACE}', 'past_due', '${PREMIUM_PLAN}', now() - interval '2 days', now() - interval '1 minute', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, grace_period_until, is_lifetime)
      VALUES ('${FREE_GRACE}', 'past_due', '${FREE_PLAN}', now() - interval '2 days', now() + interval '3 days', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${LATEST_EXPIRED}', 'active', '${PRO_PLAN}', now() - interval '10 days', true);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${LATEST_EXPIRED}', 'active', '${PRO_PLAN}', now() - interval '1 day', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${LATEST_LIFETIME}', 'active', '${PRO_PLAN}', now() + interval '30 days', false);
    INSERT INTO public.subscriptions (user_id, status, plan_id, current_period_end, is_lifetime)
      VALUES ('${LATEST_LIFETIME}', 'canceled', '${FREE_PLAN}', now(), true);
  `)
  return db
}

async function isFree(db: PGlite, userId: string): Promise<boolean> {
  const result = await db.query<{ free: boolean }>(
    'SELECT public.is_free_analytics_user($1::uuid) AS free',
    [userId],
  )
  return result.rows[0]?.free === true
}

async function expenseCount(db: PGlite, userId: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM public.expenses WHERE user_id = $1::uuid',
    [userId],
  )
  return result.rows[0]?.n ?? 0
}

describe('is_free_analytics_user', () => {
  it('checks lifetime on the latest row before period end, then grace', async () => {
    const db = await database()
    expect(await isFree(db, LIFETIME)).toBe(false)
    expect(await isFree(db, EXPIRED)).toBe(true)
    expect(await isFree(db, IN_GRACE)).toBe(false)
    expect(await isFree(db, PAST_GRACE)).toBe(true)
    expect(await isFree(db, FREE_GRACE)).toBe(true)
    expect(await isFree(db, USER)).toBe(true)
    expect(await isFree(db, LATEST_EXPIRED)).toBe(true)
    expect(await isFree(db, LATEST_LIFETIME)).toBe(false)
  })
})

describe('enforce_free_history_lock', () => {
  it('rejects an old insert or date change for a Free user and leaves deletes alone', async () => {
    const db = await database()
    await db.exec(`
      INSERT INTO public.expenses (user_id, date, amount)
        VALUES ('${LIFETIME}', (current_date - interval '91 days')::date, 10);
    `)
    await db.exec(`
      UPDATE public.subscriptions SET is_lifetime = false, status = 'active', plan_id = '${PRO_PLAN}',
        current_period_end = now() - interval '1 day'
      WHERE user_id = '${LIFETIME}';
    `)
    expect(await isFree(db, LIFETIME)).toBe(true)

    await expect(db.exec(`
      INSERT INTO public.expenses (user_id, date, amount)
        VALUES ('${LIFETIME}', (current_date - interval '91 days')::date, 11);
    `)).rejects.toThrow(/HISTORY_LOCKED/)

    await expect(db.exec(`
      UPDATE public.expenses SET date = (current_date - interval '200 days')::date
      WHERE user_id = '${LIFETIME}';
    `)).rejects.toThrow(/HISTORY_LOCKED/)

    const dated = await db.query<{ date: string }>(
      `SELECT date::text FROM public.expenses WHERE user_id = '${LIFETIME}'`,
    )
    expect(dated.rows).toHaveLength(1)

    await db.exec(`UPDATE public.expenses SET deleted_at = now() WHERE user_id = '${LIFETIME}'`)
    await db.exec(`DELETE FROM public.expenses WHERE user_id = '${LIFETIME}'`)
    expect(await expenseCount(db, LIFETIME)).toBe(0)

    await expect(db.exec(`
      INSERT INTO public.income_records (user_id, date, total_amount)
        VALUES ('${USER}', (current_date - interval '91 days')::date, 5);
    `)).rejects.toThrow(/HISTORY_LOCKED/)

    await db.exec(`
      INSERT INTO public.expenses (user_id, date, amount)
        VALUES ('${USER}', (current_date - interval '90 days')::date, 1);
    `)
    expect(await expenseCount(db, USER)).toBe(1)
  })

  it('rolls back a mixed insert so one old row does not save the recent rows either', async () => {
    const db = await database()
    await expect(db.exec(`
      INSERT INTO public.expenses (user_id, date, amount) VALUES
        ('${USER}', current_date, 1),
        ('${USER}', (current_date - interval '91 days')::date, 2);
    `)).rejects.toThrow(/HISTORY_LOCKED/)
    expect(await expenseCount(db, USER)).toBe(0)

    await db.exec(`
      INSERT INTO public.expenses (user_id, date, amount)
        VALUES ('${IN_GRACE}', (current_date - interval '400 days')::date, 9);
    `)
    expect(await expenseCount(db, IN_GRACE)).toBe(1)
  })
})
