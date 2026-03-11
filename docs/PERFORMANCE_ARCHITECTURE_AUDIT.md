# KlaroPH Performance Architecture Audit

**Date:** March 2026  
**Scope:** Query efficiency, page data flow, scalability, future load resilience.  
**Method:** Codebase trace only; no code modified.

---

## A. Executive Summary

**Verdict: Architecture is workable at low concurrency but has clear efficiency and scalability risks.**

- **Strengths:** Subscription/features are centralized in one API; Expenses and Income pages use a single fetch per page for list + charts (shared in-memory aggregation). RLS and plan resolution are in place.
- **Weaknesses:**
  - **Dashboard** does not use a single parent fetch: multiple components each trigger their own API or Supabase calls (goals, allocations, expenses for chart, budget-effective, expense-months, expenses for budget, income+expenses for flow). The same logical data (e.g. expenses) is fetched multiple times with different date ranges.
  - **Duplicate frontend calls:** `/api/profile` is requested twice on load (DashboardLayoutClient and Sidebar). `/api/features` triggers **two** subscription-state resolutions per request (resolveUserPlan already calls resolveSubscriptionState; then features route calls it again).
  - **No shared data layer:** Cards, charts, and tables are not fed from one server-supplied dataset; each component fetches independently. After one transaction insert, every listening page bumps a refresh trigger and refetches everything (no granular invalidation).
  - **Missing indexes:** No explicit indexes on `expenses(user_id, date)` or `income_records(user_id, date)` in migrations. Subscription lookups use `user_id` and `current_period_end`; only PayMongo-related indexes exist.
  - **Heavy payloads:** Analytics export and “All Time” flows can load full transaction history with no pagination. Dashboard visibility change triggers a global refresh (throttled 3s), causing full refetches across open views.

**Conclusion:** The app is adequate for tens to low hundreds of concurrent users with moderate data per user. At 1,000+ users or heavy “All Time”/export usage, subscription checks, dashboard load, and export are the first likely bottlenecks. Introducing shared data for the dashboard, deduplicating profile/features calls, adding indexes, and adding summary/cache layers will be necessary before scaling.

---

## B. Page-by-Page Technical Table

| Page / Area | Frontend Calls (HTTP) | Client Supabase / RPC | Server-Side (layout/API) | SQL Queries (approx. per load) | Duplicate Calls Found |
|-------------|------------------------|------------------------|----------------------------|--------------------------------|------------------------|
| **Dashboard (layout + page)** | `/api/profile` ×2 (LayoutClient + Sidebar), `/api/features` ×1, `/api/budget-effective` ×1, `/api/expense-months` ×1 | goals (select), income_allocations (select), expenses (chart: 6 months), expenses (BudgetOverview: 1 month), income_records + expenses (IncomeExpenseFlow: 1 month) | Layout: getSession, profiles select (id), possible profile insert, profiles select (terms/onboarding). Features: see below. | Layout: 2–4. Profile API: 1 select + 2 RPCs (get_profile_completion, get_clarity_level; clarity_level does goals COUNT + profile + streak). Features: 2× subscriptions select, 1 plans select, 1 profiles select. Budget-effective: 2 (budget_plans, budget_overrides). Expense-months: 1 (expenses date scan). Chart: 1. BudgetOverview expenses: 1. IncomeExpenseFlow: 2. Goals + allocations: 2. | **Yes:** profile ×2; expenses fetched 3× (chart, budget, flow); subscription resolved 2× per /api/features. |
| **Expenses** | `/api/features` (SubscriptionProvider), `/api/budget-effective` ×1, `/api/expense-months` ×1 (via BudgetOverview), optionally `/api/analytics/export` | expenses (list + charts derived in-memory), BudgetOverview internal: budget-effective + expense-months + expenses by month | — | 1 expenses list query; BudgetOverview adds budget-effective (2), expense-months (1), expenses by month (1). All-time: +2 (getAllTimeRangeAndGrouping min/max). | **Yes:** BudgetOverview repeats budget-effective + expense-months + expenses; list and budget use same table with different ranges. |
| **Income** | `/api/features`, optionally `/api/analytics/export` | income_records (list + charts in-memory). All-time: getAllTimeRangeAndGrouping (2 queries) then list | — | 1 income_records list; all_time: +2 for range. | **No** duplicate for list/charts (single fetch, shared data). All-time range uses 2 extra queries. |
| **Goals** | `/api/features` | goals count (head), GoalList: goals select + income_allocations select | — | 1 count + 1 goals select + 1 income_allocations select. | **No** duplicate; GoalList shares data with momentum summary via callback. |
| **Budgeting** | — | — | — | **No dedicated “Budgeting” page.** Budget UI lives on Dashboard (BudgetOverview) and Expenses (BudgetOverview + BudgetPlanner + MonthOverride). Same budget-effective / expense-months / expenses pattern as above. | Same duplicates as Dashboard/Expenses. |
| **Reports** | — | — | **No dedicated “Reports” page.** Charts and tables on Expenses and Income act as reports; data comes from the same list fetch per page (efficient). Export is full history (see Payload). | — | N/A |

**Notes:**

- “Frontend calls” = browser-initiated fetch to Next.js API routes.
- “Client Supabase” = direct Supabase client calls from the client (RLS applies).
- “SQL queries” = approximate total per full page load including layout and all child components.
- **Dashboard total:** ~4 HTTP + 6+ Supabase client calls; multiple SQL per API (profile: 1 + 2 RPCs; features: 2 sub + 1 plan + 1 profile; budget-effective: 2; expense-months: 1; chart: 1; budget expenses: 1; flow: 2; goals: 2).

---

## C. Shared Data Architecture Validation

- **Reusing same dataset:**
  - **Expenses page:** One `expenses` fetch supplies the list, trend chart, and category chart (aggregation in memory). BudgetOverview on the same page does **not** reuse this; it has its own fetch for its selected month and calls budget-effective + expense-months.
  - **Income page:** One `income_records` fetch supplies list and charts; no reuse elsewhere.
  - **Goals page / GoalList:** One goals + income_allocations load feeds the list and momentum summary (via `onDataLoaded`).

- **Separate fetches that could be shared:**
  - **Dashboard:** Goals + allocations, expenses (chart), expenses (BudgetOverview), income_records + expenses (IncomeExpenseFlow) are independent. No parent that fetches once and passes props. Same expense table hit for chart (6 months), budget (1 month), and flow (1 month).
  - **Profile:** Fetched in both DashboardLayoutClient (on mount) and Sidebar (on mount). Same GET /api/profile; no shared context.
  - **Features:** Fetched once by SubscriptionProvider; shared via context. No duplicate from other components, but **server-side** /api/features runs resolveSubscriptionState twice (inside resolveUserPlan and again explicitly).

- **Data transformation:** Aggregations (by category, by month, trend) are done in the client with useMemo over fetched rows. This is efficient for moderate row counts but does not reduce DB load; each component still triggers its own query.

---

## D. Transaction Insert Impact Audit

**Flow: Insert transaction (expense or income) → Dashboard → Expense Page → Reports → Goals → Budgets**

1. **Insert path:** User submits from AddExpenseModal or IncomeAllocationModal (or FAB). Request goes to API (e.g. POST /api/expenses or /api/income). Insert is one write.

2. **After save (modal onSaved):**
   - Modals in DashboardLayoutClient call `router.refresh()` and `dispatchDashboardRefresh()`.
   - `router.refresh()` re-runs server components (e.g. dashboard layout); layout does getSession + profile checks again (2–3 queries).
   - `dispatchDashboardRefresh()` fires `DASHBOARD_REFRESH_EVENT`; all listeners bump their `refreshTrigger`.

3. **Which pages/summaries refresh:**
   - **Dashboard:** refreshTrigger bumps → loadData (goals + income_allocations), ExpensesTrendChartCard refetches expenses (6 months), BudgetOverview refetches budget-effective + expenses (month) + expense-months, IncomeExpenseFlow refetches income_records + expenses (month).
   - **Expenses page (if open):** refreshTrigger bumps → expense list refetch, BudgetOverview refetches as above.
   - **Income page (if open):** refreshTrigger bumps → income list refetch; all_time also refetches getAllTimeRangeAndGrouping + list.
   - **Goals page (if open):** refreshTrigger bumps → goal count refetch, GoalList refetches goals + income_allocations.

4. **Full page refetch:** Yes. Every component that depends on `refreshTrigger` or equivalent re-runs its useEffect and refetches its full dataset. There is no “invalidate only expenses for this month” or “append this transaction.”

5. **Unnecessary recomputation:** Goals and allocations are refetched even when only an expense/income was added (no goal/allocation change). Budget-effective and expense-months are refetched even though an expense insert does not change budget_plans or budget_overrides.

6. **router.refresh:** Used on every modal save (goal, income, expense). It re-executes server layout (auth + profile), so 2–3 server queries per insert from layout alone.

7. **Over-fetch risk:** High. One transaction insert causes 2–3 layout queries plus 4+ dashboard refetches (goals, allocations, chart expenses, budget-effective, expense-months, budget expenses, income+expenses flow). If Expenses or Goals are open, their full refetches also run.

---

## E. SQL Efficiency Audit

**Findings:**

1. **Missing indexes (evidence from migrations):**
   - **expenses:** No migration found that creates an index on `(user_id, date)`. RLS and filters use `user_id` and `date` (e.g. `.eq('user_id', user.id).gte('date', start).lte('date', end)`). Without an index, these can cause full table scans per user.
   - **income_records:** Same; no index on `(user_id, date)` in audited migrations.
   - **goals:** Referenced with `user_id`; primary key on `id` only. No explicit `(user_id)` index seen (UNIQUE or index on subscriptions.user_id exists).
   - **subscriptions:** Has `UNIQUE(user_id)` and PayMongo-related indexes; `current_period_end` used in ORDER BY and WHERE in get_user_features and resolveSubscriptionState — no dedicated composite index seen for (user_id, current_period_end).
   - **budget_plans / budget_overrides:** Have unique indexes on (user_id, category) and (user_id, category, month). Good.

2. **Repeated aggregations:** Dashboard and Expenses each compute spending by category or by month in the client from raw rows. The same expense table is queried multiple times (different date ranges) instead of one query with server-side GROUP BY or a summary table.

3. **Expensive GROUP BY / SUM:** Not done in DB for dashboard charts; data is fetched as rows and aggregated in JS. Export and all_time use full table scans (no limit); is_free_analytics_user runs a subscription + plan lookup per row for RLS (can be heavy under load).

4. **Unnecessary raw table scans:** expense-months returns all `date` values for last 24 months then deduplicates to month list in the API — full scan over that range. getAllTimeRangeAndGrouping does two separate queries (min date, max date) instead of one with min/max aggregation.

**Recommendation (indexes):** Add at least:
- `CREATE INDEX idx_expenses_user_date ON expenses(user_id, date);`
- `CREATE INDEX idx_income_records_user_date ON income_records(user_id, date);`
- Consider `(user_id, current_period_end DESC)` on subscriptions for active-subscription lookups.

---

## F. Payload Size Audit

- **Dashboard:** Each component fetches its own slice. Expenses chart: 6 months of rows. BudgetOverview: one month of expenses (and budget-effective, expense-months). IncomeExpenseFlow: one month income + expenses. No single “full history” on dashboard, but multiple overlapping date-range requests.

- **Expenses / Income pages:** List + charts use one fetch for the selected period. Period can be “All Time”; then the client fetches all matching rows (no pagination). For large accounts this can be very large.

- **/api/analytics/export:** Fetches **all** income_records and **all** expenses (no date filter, no limit). RLS still applies (e.g. 90-day for free), but for Pro users the payload is unbounded. High over-fetch risk.

- **/api/expense-months:** Returns list of month strings; payload small. /api/budget-effective: list of category/amount; small.

- **Recommendation:** Paginate or limit list endpoints (e.g. last N months or last 500 rows). For export, consider streaming or chunked export and/or date-range limits. For “All Time” UI, consider server-side aggregation (e.g. by month) instead of sending all rows.

---

## G. Scalability Risk Projection

| Scale | First likely bottlenecks | Evidence |
|-------|---------------------------|----------|
| **~100 users** | Unlikely to break; may see slower dashboard if many use “All Time” or large exports. | Multiple parallel fetches per dashboard load; duplicate profile/features. |
| **~1,000 users** | **Subscription/features** (resolveSubscriptionState + resolveUserPlan called twice per /api/features; no caching). **Dashboard** (many parallel requests per visit). **Export** (full table read per user). | High request volume per session; no cache headers on features; export is unbounded. |
| **~10,000 users** | **Reports/analytics** (repeated expense/income range queries; no summary tables). **Dashboard summaries** (same). **Transaction inserts** (each insert triggers full refetch on all open tabs). **Subscription checks** (every features call hits DB 2×). **AI categorization** (if added, per-transaction calls). | No aggregate tables; no selective invalidation; subscription and profile read-heavy. |

**Feature most likely to break first at scale:** Subscription/plan resolution (many /api/features calls; duplicate subscription queries; no cache), then dashboard load (many components, each with its own fetch), then export (unbounded full history).

---

## H. Caching and Aggregation Opportunities

1. **Aggregate summary tables:**
   - **Monthly expense summary:** e.g. `(user_id, month, category, total_amount)` updated on insert/update/delete (trigger or job). Dashboard chart and budget overview could read from this instead of scanning expenses.
   - **Monthly income summary:** Same for income_records.

2. **Cached monthly summaries:** Server or edge cache for “current month” totals per user (short TTL, e.g. 60s). Dashboard could show cached totals and refresh in background.

3. **Selective invalidation:** On expense/income insert, invalidate only: that user’s current-month (and affected month) summaries and, if needed, expense-months list. Do not invalidate goals/allocations unless goal or allocation changed. Consider a small event payload (e.g. “expenses updated for user X, month Y”) so clients refetch only that slice.

4. **Lightweight summary endpoints:** e.g. GET /api/dashboard/summary returning goals count, allocations sum, current-month income/expense totals, last-6-months expense-by-month — one server-side function or a few queries instead of 6+ client-driven fetches.

5. **Subscription/features cache:** Cache /api/features response per user (e.g. 60s) or cache resolveSubscriptionState result in memory per request so the same request does not call it twice.

---

## I. Hidden Query Abuse Detection

- **Repeated hooks:** SubscriptionProvider runs load() once on mount; no repeated hooks for features. Dashboard page runs refresh() in useEffect when refreshTrigger exists; dependency is [refresh], so it runs once after mount and again when refresh is called (e.g. from visibility change). That’s intentional but can cause a burst of refetches (features + all dashboard children).

- **Duplicate server calls:** Confirmed: GET /api/profile from DashboardLayoutClient and from Sidebar (two independent useEffects). GET /api/features uses resolveUserPlan(user.id) which calls resolveSubscriptionState(user.id), then the route calls resolveSubscriptionState(user.id) again — two identical subscription queries per request.

- **Repeated server component fetches:** Layout is a server component; it runs once per navigation/router.refresh. Every modal save triggers router.refresh(), so layout re-runs and runs 2–3 DB operations again. Not “repeated” in a loop but triggered on every mutation.

- **Visibility change:** When the user returns to the tab (visibilitychange) or after bfcache (pageshow), dispatchDashboardRefresh() runs (throttled 3s). Every page listening for DASHBOARD_REFRESH_EVENT refetches. If the user has multiple tabs (dashboard, expenses, goals), all refetch at once. This is by design but can create a spike of queries.

---

## J. Immediate Risks

1. **Duplicate /api/profile:** Two identical calls on every dashboard load; doubles profile + RPC load.
2. **Duplicate resolveSubscriptionState in /api/features:** Two subscription queries per features request; doubles subscription/plan read load.
3. **No indexes on expenses/income_records (user_id, date):** As data grows, list and chart queries can slow and increase DB load.
4. **Full refetch on every mutation:** One insert causes layout refresh + full refetch of all dashboard (and open page) data; unnecessary for goals/budget config when only expense/income changed.
5. **Unbounded export:** Pro users can request full history CSV; risk of timeouts and memory pressure at scale.

---

## K. Recommended Fixes by Priority

**Priority 1 (critical now)**  
- Add indexes on `expenses(user_id, date)` and `income_records(user_id, date)`.  
- Remove duplicate resolveSubscriptionState in /api/features (use plan from resolveUserPlan; do not call resolveSubscriptionState again, or refactor so one subroutine returns both plan and status).  
- Deduplicate /api/profile: fetch once (e.g. in LayoutClient or a shared provider) and pass profile to Sidebar via context or props.

**Priority 2 (before scaling)**  
- Introduce a single dashboard data fetch (or lightweight /api/dashboard/summary) and pass shared data into GoalMomentumSection, ExpensesTrendChartCard, BudgetOverview, and IncomeExpenseFlow where possible.  
- Paginate or limit list endpoints (expenses/income) and add date-range or limit to export.  
- On transaction insert, avoid router.refresh() if possible, or limit it to layout that must re-run; narrow DASHBOARD_REFRESH_EVENT to “expenses/income updated” so only affected components refetch.  
- Cache /api/features (or subscription state) per user with short TTL (e.g. 60s) or at least deduplicate within the same request.

**Priority 3 (future optimization)**  
- Add monthly summary tables (expenses/income by user, month, category/source) and use for dashboard and reports.  
- Lightweight summary endpoint for dashboard (single server-side aggregation).  
- Selective invalidation (event payload with entity type + scope) instead of global refresh.

---

## L. Load Testing Readiness

**Recommend stress-testing in this order:**

1. **GET /api/features** — Called on every dashboard load; currently 2× subscription + 1 plan + 1 profile. Simulate 50–100 concurrent users hitting dashboard; measure DB and API latency.
2. **Dashboard load (full)** — Simulate a user opening dashboard (profile, features, budget-effective, expense-months, goals, allocations, chart expenses, budget expenses, income+expenses). Measure end-to-end LCP and number of queries.
3. **Expense/income list with date range** — Queries filtering by user_id and date; without indexes these can degrade. Test with 10k+ rows per user.
4. **POST expense then refetch** — One insert followed by all dashboard refetches; measure spike in DB and API calls.
5. **GET /api/analytics/export** — Pro user with large history; measure response size and time; consider 30k+ rows.
6. **Visibility change / multi-tab** — Multiple tabs open; trigger visibilitychange and measure refetch burst.

**Suggested tooling:** k6 or Artillery for API and page flows; Supabase/DB metrics for query count and slow queries. Add logging for “queries per request” in key API routes (e.g. /api/features, /api/profile) to validate deduplication and cache impact.

---

*End of audit. No code was modified; all conclusions are from static trace of the current codebase.*
