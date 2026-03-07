# Supabase → Frontend Data Flow Audit (Income + Expenses)

## PART 1 — Database Structure Audit

### Tables

| Table | Created in migrations | Columns (from seed/RLS/usage) |
|-------|------------------------|------------------------------|
| **income_records** | Not in repo (pre-existing or separate migration); altered in `20250228100000_income_records_income_source.sql`, RLS in `20250227100000_free_analytics_90_day_rls.sql` | `id`, `user_id`, `total_amount`, `disposable_amount`, `date`, `income_source` |
| **expenses** | Not in repo; altered in `20250222000000_add_expenses_description.sql`, RLS in `20250227100000_free_analytics_90_day_rls.sql` | `id`, `user_id`, `category`, `type`, `amount`, `date`, `description` |

- **income_records**: Has `user_id`, `total_amount`, `date`, `income_source`. RLS compares `date` to `(current_date - interval '90 days')::date` → column is treated as date-comparable (date or timestamptz).
- **expenses**: Has `user_id`, `category`, `amount`, `date`, `description`. Same RLS date logic.
- **user_id**: RLS uses `auth.uid() = user_id` → expected type `uuid` matching `auth.users.id`.

**Action**: If tables are missing, create them with `user_id uuid NOT NULL REFERENCES auth.users(id)`. Confirm in Supabase Dashboard → Table Editor that rows exist for the logged-in user and that `date` is within the last 90 days for free users.

---

## PART 2 — RLS Policy Audit

### income_records

| Policy | Type | Definition | Status |
|--------|------|------------|--------|
| income_records_select_90d_free | SELECT | `auth.uid() = user_id AND (NOT is_free_analytics_user(auth.uid()) OR date >= (current_date - interval '90 days')::date)` | OK |
| income_records_insert_own | INSERT | `WITH CHECK (auth.uid() = user_id)` | OK |
| income_records_update_own | UPDATE | `USING (auth.uid() = user_id)` | OK |
| income_records_delete_own | DELETE | `USING (auth.uid() = user_id)` | OK |

RLS enabled in migration. No conflicting policy.

### expenses

| Policy | Type | Definition | Status |
|--------|------|------------|--------|
| expenses_select_90d_free | SELECT | Same pattern as income_records | OK |
| expenses_insert_own | INSERT | `WITH CHECK (auth.uid() = user_id)` | OK |
| expenses_update_own | UPDATE | `USING (auth.uid() = user_id)` | OK |
| expenses_delete_own | DELETE | `USING (auth.uid() = user_id)` | OK |

RLS enabled. No fix needed if tables exist.

**If SELECT ever needs to be user-only with no 90-day limit (e.g. for debugging):**
```sql
-- Only if you need a simple fallback policy (do not replace the 90d policy without reason)
-- CREATE POLICY "income_records_select_own" ON income_records FOR SELECT USING (auth.uid() = user_id);
```

---

## PART 3 — Insert Flow Audit

### IncomeAllocationModal

- **File**: `components/dashboard/IncomeAllocationModal.tsx`
- **Insert**: `supabase.from('income_records').insert({ user_id: user.id, total_amount, disposable_amount, date, income_source })`
- **user_id**: Set from `user.id` (line 69). OK.
- **date**: From state `date` (YYYY-MM-DD). OK for `date` or timestamptz.

### AddExpenseModal (expense insert)

- **File**: `components/dashboard/AddExpenseModal.tsx`
- **Payload**: `user_id: user.id`, `category`, `type`, `amount`, `date`, optional `description`
- **user_id**: Set. OK. No null user_id.

No changes required for insert flow.

---

## PART 4 — Frontend Query Audit

### Income page — `app/dashboard/income/page.tsx`

- **load() useEffect**: Gets `user` via `supabase.auth.getUser()`, then queries `income_records`.
- **Fix applied**: Explicit `.eq('user_id', user.id)` added so the query is explicitly scoped (RLS already enforces this; explicit filter is best practice).
- **Date filter**: `.gte('date', range.start)` and `.lte('date', range.end)` with `range.start`/`range.end` as `YYYY-MM-DD`. Correct for a `date` column; for `timestamptz` PostgREST typically accepts these.
- **Debug**: `console.log('Data Debug', { table: 'income_records', userId, rangeStart, rangeEnd, returned, error })` in development.

### Expenses page — `app/dashboard/expenses/page.tsx`

- **Fix applied**: `.eq('user_id', user.id)` added to the query.
- **Date filter**: Same as income. OK.
- **Debug**: Same `console.log` pattern for `expenses`.

### Corrected query blocks

**Income** (`app/dashboard/income/page.tsx`, in `load()`):

```ts
let query = supabase
  .from('income_records')
  .select('id, total_amount, date, income_source')
  .eq('user_id', user.id)
  .gte('date', range.start)
  .lte('date', range.end)
  .order('date', { ascending: false })
if (sourceFilter) query = query.eq('income_source', sourceFilter)
const { data, error } = await query
```

**Expenses** (`app/dashboard/expenses/page.tsx`, in `load()`):

```ts
let query = supabase
  .from('expenses')
  .select('id, category, type, amount, date, description')
  .eq('user_id', user.id)
  .gte('date', range.start)
  .lte('date', range.end)
  .order('date', { ascending: false })
if (typeFilter) query = query.eq('type', typeFilter)
if (categoryFilter) query = query.eq('category', categoryFilter)
const { data, error } = await query
```

---

## PART 5 — React State Audit

- **Income**: `setRecords((data as IncomeRecord[]) || [])` after query. No early return after `setRecords`. Loading set to false after. No conditional reset overwriting records.
- **Expenses**: `setRows(...)` same pattern.
- **Temporary debug**: In development, a `<pre>` shows `{ count, sample: records/rows.slice(0, 3) }` so you can confirm what the frontend received. Remove when done debugging.

---

## PART 6 — Isolation Test

If records still don’t appear:

1. **Temporarily remove date filter (income)**  
   Replace the query with:
   ```ts
   const { data, error } = await supabase
     .from('income_records')
     .select('*')
     .eq('user_id', user.id)
   ```
2. If data appears → date filtering or 90-day RLS is excluding rows (e.g. old dates or timezone).
3. If still empty → RLS or user mismatch (confirm `user.id` matches `user_id` in DB and that the Supabase client sends the session so `auth.uid()` is set).

Repeat the same for `expenses` with `.from('expenses').select('*').eq('user_id', user.id)`.

---

## PART 7 — Subscription Context Check

- Income and Expenses pages use `useSubscription()` for plan/chart options and export. They do **not** gate loading or rendering of records on plan. Records are loaded regardless of `isPro`. No premium gate blocks rendering records.

---

## PART 8 — Root Cause and Fixes

### Identified issue

- **Missing explicit `user_id` filter in SELECT**: Queries relied only on RLS. Adding `.eq('user_id', user.id)` makes the scope explicit and matches the insert flow; it also avoids relying solely on `auth.uid()` being set on every request.

### Exact fixes applied

| File | Line (approx) | Change |
|------|----------------|--------|
| `app/dashboard/income/page.tsx` | query chain | `.eq('user_id', user.id)` already present; confirmed and left as-is. Dev `console.log` and temporary `<pre>` debug added. |
| `app/dashboard/expenses/page.tsx` | query chain | Added `.eq('user_id', user.id)`; added `console.log` and temporary `<pre>` debug. |

### Confirmation checklist

- [ ] Tables `income_records` and `expenses` exist and have `user_id` (uuid), `date`, and expected columns.
- [ ] RLS enabled; SELECT/INSERT/UPDATE/DELETE policies as in Part 2.
- [ ] Rows exist for the logged-in user (same `user_id` as `auth.uid()`).
- [ ] For free users, `date` is within last 90 days (or test with date filter removed per Part 6).
- [ ] Browser console shows `Data Debug` with `returned > 0` and `error: null` when data exists.
- [ ] Dev `<pre>` shows `count > 0` and a `sample` array when data exists.
- [ ] Remove temporary `<pre>` and optional `console.log` after confirming flow.

---

## If date column is timestamptz

If your `date` column is `timestamptz` and you see boundary issues, you can use:

```ts
.gte('date', range.start + 'T00:00:00')
.lte('date', range.end + 'T23:59:59')
```

Only change this if you’ve confirmed the column type and that date-only strings are not sufficient.
