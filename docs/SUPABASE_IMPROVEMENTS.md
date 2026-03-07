# Supabase: Suggestions for Commercial Readiness

This document suggests improvements to your Supabase setup and app usage to make KlaroPH commercially competitive. **Do not treat this as a change to ARCHITECTURE.md**—these are recommendations you can adopt over time.

---

## 1. Schema & Data

- **Indexes**: Add indexes on columns used in filters and sorts so lists stay fast as data grows.
  - `goals (user_id)`, `expenses (user_id, date)`, `income_records (user_id, date)`, `income_allocations (goal_id)`, `assets (user_id)`, `liabilities (user_id)`.
- **Constraints**: Use `CHECK` constraints where useful (e.g. `expenses.amount > 0`, `expenses.type IN ('needs','wants')`) so bad data is rejected at the DB.
- **Goals limit**: You enforce “max 3 goals” in the app. For consistency and safety, consider a DB constraint or trigger that blocks inserts when `COUNT(*) >= 3` per `user_id` (optional).

---

## 2. Security & RLS

- **RLS on every table**: Ensure all user-scoped tables have RLS enabled and policies that restrict rows to `auth.uid() = user_id` (SELECT, INSERT, UPDATE, DELETE). Your app already assumes this; double-check in the Supabase dashboard.
- **No service_role in frontend**: Keep using only the anon key in the client; never expose the service_role key. Use Edge Functions or a backend if you need privileged operations.
- **Auth**: Keep email confirmation and strong password policy in Supabase Auth for production. Consider rate limiting on auth (Supabase has some built-in; review and tune).

---

## 3. Performance & Scaling

- **Connection pooling**: For server-side or serverless (e.g. Next.js API routes or SSR), use Supabase’s connection pooler (session or transaction mode) and connect via the pooler URL to avoid exhausting connections.
- **Select only what you need**: You already use targeted `select()` in many places; keep avoiding `select('*')` where a subset of columns is enough.
- **Pagination**: For goals, expenses, and income lists, add `.range(0, 49)` (or similar) and “Load more” / pagination so the app stays responsive with large datasets.

---

## 4. Reliability & Ops

- **Backups**: Enable and verify Point-in-Time Recovery (PITR) or regular backups in the Supabase project so you can restore after mistakes or incidents.
- **Monitoring**: Use Supabase dashboard (logs, API usage, DB metrics) and consider alerting on error spikes, high latency, or quota.
- **Migrations**: Keep schema changes in versioned migrations (e.g. under `supabase/migrations/`) and run them via Supabase CLI or the SQL editor so changes are repeatable and documented.

---

## 5. Product & UX (Supabase-backed)

- **Realtime (optional)**: If you want live updates (e.g. when another tab or device adds a goal), enable Realtime on the relevant tables and subscribe in the client. Start with one table to avoid complexity.
- **Offline / sync**: For a mobile or offline-first experience later, consider Supabase’s offline or sync patterns (or a library that works with Postgres/Supabase) so data can be written offline and synced when online.
- **Audit trail**: For commercial trust, consider an `audit_log` table (or Supabase Audit) recording who changed what and when; write to it from triggers or app logic, and never expose it to the anon key without strict RLS.

---

## 6. Cost & Quotas

- **Usage**: Watch database size, auth MAU, and API requests in the Supabase dashboard so you stay within plan limits and can upgrade or optimize in time.
- **Edge Functions**: If you add backend logic (e.g. webhooks, scheduled jobs, or server-only operations), use Edge Functions with the service_role only on the server side to keep the client simple and secure.

---

## Summary

- Add indexes and optional constraints; consider enforcing “max 3 goals” in the DB.
- Confirm RLS everywhere; keep anon-only in the client and use pooler + backups + migrations for production.
- Add pagination and optional Realtime/audit when they support your product goals.

These steps will help KlaroPH stay fast, secure, and maintainable as it grows.
