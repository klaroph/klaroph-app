# Short-Term Performance Fixes Applied (Post-Audit)

**Date:** March 2026  
**Scope:** P1–P5 from audit; no architecture redesign, no breaking changes.

---

## Query Visibility Report: Before vs After

### Dashboard

| Metric | Before | After |
|--------|--------|--------|
| **Frontend calls (HTTP)** | `/api/profile` ×2, `/api/features` ×1, `/api/budget-effective` ×1, `/api/expense-months` ×1 | `/api/profile` ×1, `/api/features` ×1, `/api/budget-effective` ×1, `/api/expense-months` ×1 |
| **Server actions (API invocations)** | Same 4 routes, but profile requested twice from client | Same 4 routes, profile requested once (shared via context) |
| **SQL count estimate (per load)** | Profile: 1 select + 2 RPCs (×2 = 2 select + 4 RPCs). Features: 2× subscriptions + 1 plan + 1 profile. Rest unchanged. | Profile: 1 select + 2 RPCs (×1). Features: 1× subscriptions + 1 plan + 1 profile. Rest unchanged. |
| **After one expense/income insert** | router.refresh() (layout 2–3 queries) + full dashboard refresh (goals + allocations + chart + budget + flow) | No router.refresh(); only transactions refresh (chart + budget + flow). Goals + allocations **not** refetched. |

**Reduction:** 1 fewer `/api/profile` request per dashboard load; 1 fewer subscription query per `/api/features` request; on expense/income save, no layout refetch and no goals/allocations refetch.

---

### Expenses

| Metric | Before | After |
|--------|--------|--------|
| **Frontend calls** | `/api/features`, `/api/budget-effective`, `/api/expense-months` (via BudgetOverview), optional export | Unchanged |
| **SQL count estimate** | 1 expenses list + budget-effective (2) + expense-months (1) + expenses by month (1). On save: full refetch + layout. | Same per load. On expense save: no router.refresh(); only transactions event → list + BudgetOverview refetch; goals not refetched if goals page open. |

**Reduction:** On expense add/edit/delete from this page, no layout refetch; other pages listening only for transactions refresh (Expenses + Dashboard transaction widgets), not goals.

---

### Income

| Metric | Before | After |
|--------|--------|--------|
| **Frontend calls** | `/api/features`, optional export | Unchanged |
| **SQL count estimate** | 1 income_records list; all_time: +2 for range. On save: full refetch + layout. | Same per load. On income save: no router.refresh(); only transactions event; goals not refetched. |

**Reduction:** On income add/delete, no layout refetch; only transaction-related listeners refetch.

---

## Summary Table (Before vs After)

| Area | Before | After |
|------|--------|--------|
| **Profile requests per dashboard load** | 2 | 1 |
| **Subscription queries per /api/features** | 2 | 1 |
| **Layout refetch on expense/income save** | Yes (router.refresh) | No |
| **Goals refetch on expense/income save** | Yes (full event) | No (transactions event only) |
| **Indexes on expenses / income_records / subscriptions** | None for (user_id, date) or (user_id, period_end) | idx_expenses_user_date, idx_income_records_user_date, idx_subscriptions_user_period |

---

## Files Changed

- `supabase/migrations/20260315000000_performance_indexes.sql` — **New.** Three indexes (expenses, income_records, subscriptions).
- `lib/resolveUserPlan.ts` — Added `resolveUserPlanFromSubscription(sub)`, `getPlanRow(planId)`; `resolveUserPlan` now uses them. Export `NormalizedSubscription` usage.
- `app/api/features/route.ts` — Resolve subscription once; call `resolveUserPlanFromSubscription(sub)`; removed second `resolveSubscriptionState`.
- `contexts/DashboardProfileContext.tsx` — **New.** Provider + `useDashboardProfile()` for shared profile.
- `app/dashboard/DashboardLayoutClient.tsx` — Profile state; fetch once; `DashboardProfileProvider`; FAB expense/income save: `dispatchDashboardTransactionsRefresh()` only, no `router.refresh()`.
- `components/layout/Sidebar.tsx` — Use `useDashboardProfile()`; removed `/api/profile` fetch.
- `lib/dashboardRefresh.ts` — Added `DASHBOARD_GOALS_REFRESH_EVENT`, `DASHBOARD_TRANSACTIONS_REFRESH_EVENT`, `dispatchDashboardGoalsRefresh()`, `dispatchDashboardTransactionsRefresh()`.
- `app/dashboard/page.tsx` — `goalsRefreshTrigger`; listen to goals + transactions + full; loadData depends on `goalsRefreshTrigger`; ManageGoals/NewGoal dispatch full or goals.
- `app/dashboard/goals/page.tsx` — Listen to goals event; on delete dispatch `dispatchDashboardGoalsRefresh()`.
- `app/dashboard/expenses/page.tsx` — Listen to transactions event; all expense/budget save handlers use `dispatchDashboardTransactionsRefresh()`; removed `router.refresh()` from add/edit expense.
- `app/dashboard/income/page.tsx` — Listen to transactions event; save/delete use `dispatchDashboardTransactionsRefresh()`; removed `router.refresh()` from modal save.
- `components/dashboard/ImportCSVModal.tsx` — After import, `dispatchDashboardTransactionsRefresh()`.
- `docs/PERF_FIXES_APPLIED.md` — **New.** This report.

---

## Exact Fixes Applied

1. **P1 — Indexes:** One migration adding `idx_expenses_user_date`, `idx_income_records_user_date`, `idx_subscriptions_user_period` with `IF NOT EXISTS`.
2. **P2 — Subscription once per request:** `/api/features` calls `resolveSubscriptionState(user.id)` once, then `resolveUserPlanFromSubscription(sub)`; no second subscription query.
3. **P3 — Profile once:** Single fetch in DashboardLayoutClient; result stored in state and provided via `DashboardProfileProvider`; Sidebar uses `useDashboardProfile()` and does not call `/api/profile`.
4. **P4 — Granular refresh:** New events `DASHBOARD_GOALS_REFRESH_EVENT` and `DASHBOARD_TRANSACTIONS_REFRESH_EVENT`. Dashboard listens to both and uses separate triggers for goals vs chart/budget/flow. Expense/income save (and import) dispatch only transactions refresh; goal save/dispatch still use full or goals refresh. Removed `router.refresh()` from expense/income save in LayoutClient and from Expenses/Income page modals.
5. **P5 — Query visibility:** This document (before/after for Dashboard, Expenses, Income).

---

## Query Reduction Achieved

- **Per dashboard load:** −1 `/api/profile` request; −1 subscription query inside `/api/features` (so −1 subscriptions read per features call).
- **Per expense/income insert (FAB or page):** −1 layout refetch (no `router.refresh()`), −(goals + allocations refetch) on dashboard when only transactions changed; Goals page no longer refetches on expense/income save.
- **DB:** After migration, list/range queries on expenses and income_records can use (user_id, date) indexes; subscription lookup can use (user_id, current_period_end DESC). Fewer full scans, better scalability under load.

---

## Expected Query Improvements (Indexes)

- **expenses (user_id, date):** Range filters `.eq('user_id', ...).gte('date', ...).lte('date', ...)` and ordering by date can use index; avoids full table scan per user.
- **income_records (user_id, date):** Same for income list and chart queries.
- **subscriptions (user_id, current_period_end DESC):** Single-row active subscription lookup can use index; reduces cost of resolveSubscriptionState and get_user_features.

---

## Remaining Medium-Term Risks

- Dashboard still has multiple independent fetches (goals, chart, budget, flow); no single shared data load.
- BudgetOverview and expense-months still refetch on transactions refresh even when only one expense added (no summary cache).
- Export and “All Time” still unbounded; no pagination or streaming.
- No caching of /api/features or subscription state; every navigation/load hits the API.
- Visibility change still dispatches full refresh (throttled), causing all pages to refetch.

These are left for a later iteration (architecture or caching) and were explicitly out of scope for this short-term fix set.
