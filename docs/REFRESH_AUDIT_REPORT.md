# KlaroPH State Refresh Audit Report

**Scope:** CRUD refresh reliability, cross-page consistency, mobile FAB flows, and mobile lifecycle (PWA/iPhone).  
**Approach:** Audit + targeted stabilization. No app-structure redesign.

---

## 1. Weak Points Found (Pre-Fix)

| Area | Weak point | Impact |
|------|------------|--------|
| **Expenses page** | Add/Edit expense and budget save did not dispatch `DASHBOARD_REFRESH_EVENT`. Dashboard and other pages (e.g. goals) did not refresh when expense/budget changed from expenses page. | Stale dashboard after add/edit expense or budget from expenses page. |
| **Income page** | Add/Edit income and delete did not dispatch. Same cross-page staleness. | Stale dashboard/totals when income changed from income page. |
| **Goals page** | Delete goal did not dispatch. | Dashboard and other listeners did not refresh after goal delete. |
| **Dashboard** | `BudgetOverview` did not receive a refresh key from dashboard. When dashboard refreshed (e.g. after FAB add), budget data refetched only on `selectedMonth` change. | Budget card on dashboard could show stale data until month change. |
| **Dashboard** | New goal from dashboard modal and ManageGoalsModal did not dispatch. | Goals page (if open elsewhere) would not refresh; consistency gap. |
| **Mobile / PWA** | No `visibilitychange` (or `focus`/`pageshow`) handling. Returning to the app from background did not trigger refetch. | Stale data when switching back to KlaroPH on iPhone/PWA. |
| **Bills** | No separate “bills” feature found in codebase; only PayMongo/subscription references. | N/A. |

---

## 2. Files Affected

| File | Change |
|------|--------|
| `app/dashboard/expenses/page.tsx` | Import `dispatchDashboardRefresh`. Call it from: AddExpenseModal `onSaved`, EditExpenseModal `onSaved`, inline delete expense, BudgetPlanner `onSaved`, MonthOverrideModal `onSaved`. |
| `app/dashboard/income/page.tsx` | Import `dispatchDashboardRefresh`. Call it from: IncomeAllocationModal `onSaved`, inline delete income. |
| `app/dashboard/goals/page.tsx` | Import `dispatchDashboardRefresh`. Call it from: `handleDeleteGoal` after successful delete. |
| `app/dashboard/page.tsx` | Import `dispatchDashboardRefresh`. Call it from: NewGoalModal `onGoalCreated`, ManageGoalsModal `onGoalsChange`. Pass `budgetRefreshKey={refreshTrigger}` to `BudgetOverview` so budget refetches when dashboard refreshes. |
| `app/dashboard/DashboardLayoutClient.tsx` | Add `visibilitychange` listener: when `document.visibilityState === 'visible'`, call `dispatchDashboardRefresh()` (throttled to 3s) so all listening pages refetch when user returns to app (PWA/iPhone). |
| `lib/dashboardRefresh.ts` | Comment already updated (no code change in this audit). |

**Already correct (no change):**

- `DashboardLayoutClient` FAB modals (goal, income, expense): already call `router.refresh()` and `dispatchDashboardRefresh()` on save.
- `ImportCSVModal`: already dispatches after import.
- Dashboard, expenses, income, goals pages: already listen for `DASHBOARD_REFRESH_EVENT` and bump `refreshTrigger` to refetch.
- Inline delete on expenses/income: already called `setRefreshTrigger`; now also dispatch for cross-page consistency.

---

## 3. Exact Refresh Strategy Applied

### 3.1 Single event: `DASHBOARD_REFRESH_EVENT` (`klaroph-dashboard-refresh`)

- **Dispatch:** Any create/update/delete that affects dashboard or other pages calls `dispatchDashboardRefresh()`.
- **Listen:** Dashboard, expenses, income, and goals pages subscribe with `window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)`; `onRefresh` does `setRefreshTrigger((n) => n + 1)`.
- **Effect:** Each listening page refetches its own data (via `refreshTrigger` in useEffect deps). No full page reload; no duplicate fetch loops because only one event is fired per action.

### 3.2 Where we dispatch (after this audit)

| Source | When |
|--------|------|
| **Layout (FAB)** | After add goal, add income, add expense (already present). |
| **Dashboard** | After add goal (NewGoalModal), after goals change (ManageGoalsModal). |
| **Expenses page** | After add expense, edit expense, delete expense, budget save (BudgetPlanner), month override save (MonthOverrideModal). |
| **Income page** | After add/edit income, delete income. |
| **Goals page** | After delete goal. |
| **Import** | After CSV import (already present). |
| **Mobile lifecycle** | When app becomes visible again (`visibilitychange` → visible), once per 3s max. |

### 3.3 Cross-page consistency

- All CRUD that can affect dashboard or other pages dispatches once.
- Only mounted pages listen; they refetch their own data. Unmounted pages (e.g. dashboard when user is on expenses) refetch on next mount (existing behavior).
- Dashboard’s `BudgetOverview` now receives `budgetRefreshKey={refreshTrigger}`, so when dashboard refreshes (event or visibility), budget data is refetched.

### 3.4 Mobile FAB flows

- FAB opens layout modals; on save they close modal, `router.refresh()`, and `dispatchDashboardRefresh()`.
- Current page (expenses/income/goals) and dashboard (if mounted) both listen, so both update immediately. No manual reload.

### 3.5 iPhone / PWA lifecycle

- One listener in `DashboardLayoutClient`: `visibilitychange` → when `document.visibilityState === 'visible'`, call `dispatchDashboardRefresh()`.
- Throttle: 3 seconds between dispatches to avoid rapid refetch on quick tab switches.
- All pages that listen for the event refetch when user returns to the app; no `focus` or `pageshow` added to avoid over-refresh.

### 3.6 What we did not do

- No full page reloads.
- No new duplicate fetch loops (same single event, same listeners).
- No redesign of app structure or data layer.
- No “bills” implementation (no bills feature in codebase).
- No `focus` / `pageshow` in addition to `visibilitychange` (visibility is sufficient and avoids double refetch on some mobile browsers).

---

## 4. Summary

- **Weak points:** Cross-page dispatch missing for expenses/income/goals CRUD and budget saves; dashboard budget not keyed to refresh; no visibility-based refresh for PWA/mobile.
- **Strategy:** One event, dispatch on every relevant CRUD and on app visible (throttled); all affected pages listen and refetch via existing `refreshTrigger` pattern.
- **Result:** Create/update/delete and return-to-app flows stay consistent across dashboard, expenses, income, and goals without manual refresh, with minimal and targeted changes.
