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
  join(process.cwd(), 'supabase/migrations/20261020035957_free_history_lock.sql'),
  'utf8',
)

async function database(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      )
    $$;
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
        VALUES ('${USER}', public.free_history_cutoff(), 1);
    `)
    expect(await expenseCount(db, USER)).toBe(1)

    await expect(db.exec(`
      INSERT INTO public.expenses (user_id, date, amount)
        VALUES ('${USER}', public.free_history_cutoff() - 1, 2);
    `)).rejects.toThrow(/HISTORY_LOCKED/)
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

describe('Manila cutoff and hidden income ownership', () => {
  it('uses Asia/Manila for the cutoff, including 8 AM Manila and the previous Los Angeles day', async () => {
    const db = await database()
    const dates = await db.query<{ label: string; cutoff: string }>(`
      SELECT 'before' AS label, ((timestamptz '2026-10-19 15:59:59+00' AT TIME ZONE 'Asia/Manila')::date - 90)::text AS cutoff
      UNION ALL
      SELECT 'midnight', ((timestamptz '2026-10-19 16:00:00+00' AT TIME ZONE 'Asia/Manila')::date - 90)::text
      UNION ALL
      SELECT 'eight', ((timestamptz '2026-10-20 00:00:00+00' AT TIME ZONE 'Asia/Manila')::date - 90)::text
    `)
    const byLabel = Object.fromEntries(dates.rows.map((row) => [row.label, row.cutoff]))
    expect(byLabel.before).toBe('2026-07-21')
    expect(byLabel.midnight).toBe('2026-07-22')
    expect(byLabel.eight).toBe('2026-07-22')
    const helper = await db.query<{ same: boolean }>(`
      SELECT public.free_history_cutoff() = ((now() AT TIME ZONE 'Asia/Manila')::date - 90) AS same
    `)
    expect(helper.rows[0]?.same).toBe(true)
  })

  it('lets a Free user update an allocation when the parent income is hidden', async () => {
    const db = await database()
    const incomeId = '66666666-6666-4666-8666-666666666666'
    const otherIncome = '77777777-7777-4777-8777-777777777777'
    const goalId = '88888888-8888-4888-8888-888888888888'
    const allocationId = '99999999-9999-4999-8999-999999999999'
    const otherAllocation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
    await db.exec(`
      CREATE TABLE public.goals (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        deleted_at timestamptz
      );
      CREATE TABLE public.income_allocations (
        id uuid PRIMARY KEY,
        user_id uuid,
        goal_id uuid NOT NULL,
        income_record_id uuid,
        amount numeric NOT NULL,
        deleted_at timestamptz
      );
      ALTER TABLE public.income_records DISABLE TRIGGER income_records_history_locked_insert;
      INSERT INTO public.income_records (id, user_id, date, total_amount)
        VALUES ('${incomeId}', '${USER}', '2020-01-01', 100),
               ('${otherIncome}', '${LIFETIME}', '2020-01-01', 50);
      ALTER TABLE public.income_records ENABLE TRIGGER income_records_history_locked_insert;
      INSERT INTO public.goals (id, user_id) VALUES ('${goalId}', '${USER}');
      INSERT INTO public.income_allocations (id, user_id, goal_id, income_record_id, amount)
        VALUES ('${allocationId}', '${USER}', '${goalId}', '${incomeId}', 10),
               ('${otherAllocation}', '${USER}', '${goalId}', '${otherIncome}', 4);
      ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "income_records_select_90d_free" ON public.income_records;
      CREATE POLICY "income_records_select_90d_free" ON public.income_records
        FOR SELECT USING (
          auth.uid() = user_id
          AND (
            NOT public.is_free_analytics_user(auth.uid())
            OR date >= public.free_history_cutoff()
          )
        );
      DROP TRIGGER IF EXISTS income_allocations_enforce_owner ON public.income_allocations;
      CREATE TRIGGER income_allocations_enforce_owner
        BEFORE UPDATE ON public.income_allocations
        FOR EACH ROW EXECUTE FUNCTION public.income_allocations_enforce_owner();
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('klaro.user_id', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION public.touch_allocation_as_definer(p_id uuid, p_amount numeric)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      BEGIN
        UPDATE public.income_allocations SET amount = p_amount WHERE id = p_id;
      END;
      $fn$;
      GRANT USAGE ON SCHEMA public TO authenticated, service_role;
      GRANT SELECT ON public.goals, public.income_records TO authenticated, service_role;
      GRANT SELECT, UPDATE ON public.income_allocations TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.touch_allocation_as_definer(uuid, numeric) TO authenticated;
    `)
    await db.exec(`
      SELECT set_config('klaro.user_id', '${USER}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
    `)
    await db.exec('SET ROLE authenticated')
    const visible = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.income_records WHERE id = '${incomeId}'`,
    )
    expect(visible.rows[0]?.n).toBe(0)
    const owned = await db.query<{ owned: boolean }>(
      `SELECT public.income_record_owned_by('${incomeId}'::uuid, '${USER}'::uuid) AS owned`,
    )
    expect(owned.rows[0]?.owned).toBe(true)
    const probe = await db.query<{ owned: boolean }>(
      `SELECT public.income_record_owned_by('${otherIncome}'::uuid, '${LIFETIME}'::uuid) AS owned`,
    )
    expect(probe.rows[0]?.owned).toBe(false)
    await db.exec(`UPDATE public.income_allocations SET amount = 25 WHERE id = '${allocationId}'`)
    await expect(db.exec(
      `UPDATE public.income_allocations SET amount = 3 WHERE id = '${otherAllocation}'`,
    )).rejects.toThrow(/Income record not found or unauthorized/)
    await db.exec(`SELECT public.touch_allocation_as_definer('${allocationId}'::uuid, 40)`)
    await db.exec('RESET ROLE')
    const saved = await db.query<{ amount: string }>(
      `SELECT amount::text FROM public.income_allocations WHERE id = '${allocationId}'`,
    )
    expect(saved.rows[0]?.amount).toBe('40')

    const session = await db.query<{ current_user: string; role: string | null }>(`
      SELECT current_user, auth.role() AS role
    `)
    expect(session.rows[0]?.current_user).not.toBe('service_role')
    await db.exec(`
      SELECT set_config('klaro.user_id', '', false);
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
    `)
    const asService = await db.query<{ owned: boolean; mismatch: boolean }>(`
      SELECT
        public.income_record_owned_by('${incomeId}'::uuid, '${USER}'::uuid) AS owned,
        public.income_record_owned_by('${incomeId}'::uuid, '${LIFETIME}'::uuid) AS mismatch
    `)
    expect(asService.rows[0]?.owned).toBe(true)
    expect(asService.rows[0]?.mismatch).toBe(false)
    await db.exec(`UPDATE public.income_allocations SET amount = 55 WHERE id = '${allocationId}'`)
    const afterService = await db.query<{ amount: string }>(
      `SELECT amount::text FROM public.income_allocations WHERE id = '${allocationId}'`,
    )
    expect(afterService.rows[0]?.amount).toBe('55')
  })

  it('returns false for a cross-user probe, true for the owner, and the real check for service role', async () => {
    const db = await database()
    const incomeId = '66666666-6666-4666-8666-666666666666'
    const otherIncome = '77777777-7777-4777-8777-777777777777'
    await db.exec(`
      ALTER TABLE public.income_records DISABLE TRIGGER income_records_history_locked_insert;
      INSERT INTO public.income_records (id, user_id, date, total_amount)
        VALUES ('${incomeId}', '${USER}', '2020-01-01', 100),
               ('${otherIncome}', '${LIFETIME}', '2020-01-01', 50);
      ALTER TABLE public.income_records ENABLE TRIGGER income_records_history_locked_insert;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('klaro.user_id', true), '')::uuid
      $$;
    `)
    await db.exec(`
      SELECT set_config('klaro.user_id', '${USER}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
    `)
    await db.exec('SET ROLE authenticated')
    const asOwner = await db.query<{ own: boolean; probe: boolean }>(`
      SELECT
        public.income_record_owned_by('${incomeId}'::uuid, '${USER}'::uuid) AS own,
        public.income_record_owned_by('${otherIncome}'::uuid, '${LIFETIME}'::uuid) AS probe
    `)
    expect(asOwner.rows[0]?.own).toBe(true)
    expect(asOwner.rows[0]?.probe).toBe(false)
    await db.exec('RESET ROLE')
    const caller = await db.query<{ current_user: string }>(`SELECT current_user`)
    expect(caller.rows[0]?.current_user).not.toBe('service_role')
    await db.exec(`
      SELECT set_config('klaro.user_id', '', false);
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
    `)
    const asService = await db.query<{ own: boolean; other: boolean; mismatch: boolean }>(`
      SELECT
        public.income_record_owned_by('${incomeId}'::uuid, '${USER}'::uuid) AS own,
        public.income_record_owned_by('${otherIncome}'::uuid, '${LIFETIME}'::uuid) AS other,
        public.income_record_owned_by('${incomeId}'::uuid, '${LIFETIME}'::uuid) AS mismatch
    `)
    expect(asService.rows[0]?.own).toBe(true)
    expect(asService.rows[0]?.other).toBe(true)
    expect(asService.rows[0]?.mismatch).toBe(false)
  })

  it('lets a postgres session with no JWT claims update an allocation, and a probe with claims stays false', async () => {
    const db = await database()
    const incomeId = '66666666-6666-4666-8666-666666666666'
    const otherIncome = '77777777-7777-4777-8777-777777777777'
    const goalId = '88888888-8888-4888-8888-888888888888'
    const allocationId = '99999999-9999-4999-8999-999999999999'
    await db.exec(`
      CREATE TABLE public.goals (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        deleted_at timestamptz
      );
      CREATE TABLE public.income_allocations (
        id uuid PRIMARY KEY,
        user_id uuid,
        goal_id uuid NOT NULL,
        income_record_id uuid,
        amount numeric NOT NULL,
        deleted_at timestamptz
      );
      ALTER TABLE public.income_records DISABLE TRIGGER income_records_history_locked_insert;
      INSERT INTO public.income_records (id, user_id, date, total_amount)
        VALUES ('${incomeId}', '${USER}', '2020-01-01', 100),
               ('${otherIncome}', '${LIFETIME}', '2020-01-01', 50);
      ALTER TABLE public.income_records ENABLE TRIGGER income_records_history_locked_insert;
      INSERT INTO public.goals (id, user_id) VALUES ('${goalId}', '${USER}');
      INSERT INTO public.income_allocations (id, user_id, goal_id, income_record_id, amount)
        VALUES ('${allocationId}', '${USER}', '${goalId}', '${incomeId}', 10);
      DROP TRIGGER IF EXISTS income_allocations_enforce_owner ON public.income_allocations;
      CREATE TRIGGER income_allocations_enforce_owner
        BEFORE UPDATE ON public.income_allocations
        FOR EACH ROW EXECUTE FUNCTION public.income_allocations_enforce_owner();
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('klaro.user_id', true), '')::uuid
      $$;
      SELECT set_config('klaro.user_id', '', false);
      SELECT set_config('request.jwt.claim.role', '', false);
      SELECT set_config('request.jwt.claims', '', false);
    `)
    const session = await db.query<{ current_user: string }>(`SELECT current_user`)
    expect(session.rows[0]?.current_user).toBe('postgres')
    await db.exec(`UPDATE public.income_allocations SET amount = 15 WHERE id = '${allocationId}'`)
    const saved = await db.query<{ amount: string }>(
      `SELECT amount::text FROM public.income_allocations WHERE id = '${allocationId}'`,
    )
    expect(saved.rows[0]?.amount).toBe('15')

    await db.exec(`
      SELECT set_config('klaro.user_id', '${USER}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
    `)
    await db.exec('SET ROLE authenticated')
    const probe = await db.query<{ owned: boolean }>(
      `SELECT public.income_record_owned_by('${otherIncome}'::uuid, '${LIFETIME}'::uuid) AS owned`,
    )
    expect(probe.rows[0]?.owned).toBe(false)
  })
})
